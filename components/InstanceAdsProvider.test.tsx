// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { InstanceResponse } from "@/lib/api/types";
import { INSTANCE_FEATURES_EVENT, setInstanceFeaturesForTests } from "@/lib/instance-features";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/instance-platform", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/instance-platform")>(), getInstanceCached: request,
}));

import { InstanceAdsProvider, useInstanceAds } from "./InstanceAdsProvider";

const ADS = {
  enabled: true,
  vast_tag_url: "https://ads.example/pre.xml",
  midroll_tag_url: "https://ads.example/mid.xml",
  midroll_offset_seconds: 300,
  postroll_tag_url: "https://ads.example/post.xml",
  midroll_min_duration_seconds: 600,
  cooldown_seconds: 300,
  embed_enabled: true,
  controls: true,
  skip_after_seconds: 5,
  midroll_offset_percent: 0,
  skip_countdown: "Skip in {seconds}…",
  skip_label: "Skip ad",
  remaining_message: "This ad will end in {seconds}",
} satisfies NonNullable<InstanceResponse["ads"]>;

function Probe() {
  const ads = useInstanceAds();
  return <output data-testid="ads">{ads === undefined ? "pending" : ads === null ? "disabled" : JSON.stringify(ads)}</output>;
}
const read = () => screen.getAllByTestId("ads").map((el) => el.textContent);
const refresh = () => act(() => { window.dispatchEvent(new Event(INSTANCE_FEATURES_EVENT)); });

afterEach(() => { cleanup(); setInstanceFeaturesForTests(null); vi.useRealTimers(); request.mockReset(); });

describe("InstanceAdsProvider", () => {
  it("keeps consumers disabled without a provider", () => {
    render(<Probe />);
    expect(read()).toEqual(["disabled"]);
    expect(request).not.toHaveBeenCalled();
  });

  it("provides known SSR config on first render and never fetches", () => {
    const view = render(<InstanceAdsProvider ads={ADS}><Probe /></InstanceAdsProvider>);
    expect(read()).toEqual([JSON.stringify(ADS)]);
    view.rerender(<InstanceAdsProvider ads={{ ...ADS, enabled: false }}><Probe /></InstanceAdsProvider>);
    expect(read()).toEqual(["disabled"]);
    view.rerender(<InstanceAdsProvider ads={null}><Probe /></InstanceAdsProvider>);
    expect(read()).toEqual(["disabled"]);
    expect(request).not.toHaveBeenCalled();
  });

  it("holds all consumers pending until one shared client read settles", async () => {
    let resolve!: (value: Partial<InstanceResponse>) => void;
    request.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<InstanceAdsProvider ads={undefined}><Probe /><Probe /></InstanceAdsProvider>);
    expect(read()).toEqual(["pending", "pending"]);
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ ads: ADS }); });
    expect(read()).toEqual([JSON.stringify(ADS), JSON.stringify(ADS)]);
  });

  it.each(["old backend", "request failure"])("fails open for %s", async (reason) => {
    request.mockImplementation(() => reason === "old backend" ? Promise.resolve({}) : Promise.reject(new Error("offline")));
    render(<InstanceAdsProvider ads={undefined}><Probe /></InstanceAdsProvider>);
    await waitFor(() => expect(read()).toEqual(["disabled"]));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["initial", "refresh"])("bounds the %s read to six seconds and ignores a late response", async (mode) => {
    vi.useFakeTimers();
    let resolve!: (value: Partial<InstanceResponse>) => void;
    request.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<InstanceAdsProvider ads={mode === "initial" ? undefined : ADS}><Probe /></InstanceAdsProvider>);
    if (mode === "refresh") refresh();
    act(() => vi.advanceTimersByTime(5999));
    expect(read()).toEqual([mode === "initial" ? "pending" : JSON.stringify(ADS)]);
    act(() => vi.advanceTimersByTime(1));
    const expected = mode === "initial" ? "disabled" : JSON.stringify(ADS);
    expect(read()).toEqual([expected]);
    await act(async () => { resolve({ ads: { ...ADS, vast_tag_url: "https://ads.example/late.xml" } }); });
    expect(read()).toEqual([expected]);
  });

  it("refreshes a known SSR seed after admin settings change", async () => {
    let resolve!: (value: Partial<InstanceResponse>) => void;
    request.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<InstanceAdsProvider ads={ADS}><Probe /></InstanceAdsProvider>);
    expect(request).not.toHaveBeenCalled();
    refresh();
    expect(read()).toEqual([JSON.stringify(ADS)]);
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ ads: { ...ADS, enabled: false } }); });
    expect(read()).toEqual(["disabled"]);
  });

  it("does not let bootstrap completion undo the initial timeout", async () => {
    vi.useFakeTimers();
    let resolve!: (value: Partial<InstanceResponse>) => void;
    request.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<InstanceAdsProvider ads={undefined}><Probe /></InstanceAdsProvider>);
    act(() => vi.advanceTimersByTime(6000));
    act(() => setInstanceFeaturesForTests({} as InstanceResponse["features"]));
    await act(async () => { resolve({ ads: ADS }); });
    expect(read()).toEqual(["disabled"]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retains known config when a refresh fails", async () => {
    request.mockRejectedValue(new Error("offline"));
    render(<InstanceAdsProvider ads={ADS}><Probe /></InstanceAdsProvider>);
    await act(async () => { refresh(); });
    expect(read()).toEqual([JSON.stringify(ADS)]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale response when a newer refresh has settled", async () => {
    let first!: (value: Partial<InstanceResponse>) => void;
    let second!: (value: Partial<InstanceResponse>) => void;
    request.mockReturnValueOnce(new Promise((done) => { first = done; }))
      .mockReturnValueOnce(new Promise((done) => { second = done; }));
    render(<InstanceAdsProvider ads={ADS}><Probe /></InstanceAdsProvider>);
    refresh();
    refresh();
    const latest = { ...ADS, vast_tag_url: "https://ads.example/updated.xml" };
    await act(async () => { second({ ads: latest }); });
    await act(async () => { first({ ads: ADS }); });
    expect(read()).toEqual([JSON.stringify(latest)]);
  });

  it("retains settled config when a later SSR seed becomes unavailable", async () => {
    request.mockResolvedValue({ ads: ADS });
    const view = render(<InstanceAdsProvider ads={undefined}><Probe /></InstanceAdsProvider>);
    await waitFor(() => expect(read()).toEqual([JSON.stringify(ADS)]));
    view.rerender(<InstanceAdsProvider ads={null}><Probe /></InstanceAdsProvider>);
    request.mockReturnValue(new Promise(() => {}));
    view.rerender(<InstanceAdsProvider ads={undefined}><Probe /></InstanceAdsProvider>);
    expect(read()).toEqual(["disabled"]);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
