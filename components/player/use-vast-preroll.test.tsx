// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VastDocument } from "@/lib/vast-client";
import { useVastPreroll } from "./use-vast-preroll";

const { loadVast, canPlayVast } = vi.hoisted(() => ({ loadVast: vi.fn(), canPlayVast: vi.fn() }));
vi.mock("@/lib/vast-client", () => ({ loadVast }));
vi.mock("@/lib/vast-cooldown", () => ({ canPlayVast }));
const AD: VastDocument = { mediaUrl: "https://ads.example/ad.mp4", duration: 20,
  skipAfter: 5, impressions: [], errors: [], tracking: {}, clickTracking: [] };
let resolveAd: (value: VastDocument | null) => void;
beforeEach(() => { canPlayVast.mockReturnValue(true); loadVast.mockImplementation(() => new Promise((resolve) => { resolveAd = resolve; })); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup(...tags: [tag?: string | null, cooldown?: number]) {
  const tag = tags.length ? tags[0] : "/vast";
  const video = document.createElement("video");
  let paused = true;
  Object.defineProperty(video, "paused", { get: () => paused });
  const play = vi.spyOn(video, "play").mockImplementation(() => {
    paused = false; video.dispatchEvent(new Event("play")); return Promise.resolve();
  });
  const pause = vi.spyOn(video, "pause").mockImplementation(() => { paused = true; });
  const ref = { current: video };
  const view = renderHook(({ id, url }) => useVastPreroll(ref, id, url, tags[1] ?? 0),
    { initialProps: { id: "v1", url: tag } });
  const request = () => { let held = false; act(() => { held = view.result.current.requestPlay(); }); return held; };
  const event = (name: string) => act(() => video.dispatchEvent(new Event(name)));
  const attach = () => { video.src = "/content.mp4"; event("loadstart"); event("canplay"); };
  return { ...view, video, play, pause, request, event, attach };
}
const deliver = (ad: VastDocument | null = AD) => act(async () => { resolveAd(ad); });

it("leaves disabled playback untouched and holds an enabled video until intent", () => {
  const disabled = setup(null);
  expect(disabled.result.current.blocked).toBe(false);
  expect(disabled.request()).toBe(false);
  disabled.event("play"); expect(disabled.pause).not.toHaveBeenCalled();
  const enabled = setup();
  expect(enabled.result.current.blocked).toBe(true);
  expect(enabled.result.current.active).toBe(false);
  expect(loadVast).not.toHaveBeenCalled();
});

it("holds intent through pending configuration and loads once when it arrives", async () => {
  const h = setup(undefined);
  expect(h.request()).toBe(true); expect(h.request()).toBe(true);
  expect(h.result.current.active).toBe(true); expect(loadVast).not.toHaveBeenCalled();
  h.rerender({ id: "v1", url: "/vast" });
  expect(loadVast).toHaveBeenCalledOnce(); h.request(); expect(loadVast).toHaveBeenCalledOnce();
  await deliver(); expect(h.result.current.ad).toEqual(AD);
  act(() => h.result.current.finish());
  expect(h.result.current.blocked).toBe(false); expect(h.result.current.active).toBe(false);
  expect(h.play).not.toHaveBeenCalled();
  h.attach(); expect(h.play).toHaveBeenCalledOnce();
  expect(h.request()).toBe(false); // replay does not request another preroll
});

it("synchronously pauses external content play without mistaking its queued pause for cancellation", async () => {
  const h = setup();
  act(() => { void h.video.play(); });
  expect(h.pause).toHaveBeenCalledOnce(); expect(h.video.paused).toBe(true);
  expect(loadVast).toHaveBeenCalledOnce();
  h.event("pause"); // pause() queues this event; it does not dispatch synchronously
  await deliver(); act(() => h.result.current.finish()); h.attach();
  expect(h.play).toHaveBeenCalledTimes(2);
});

it("preserves an external pause during loading instead of resuming behind the viewer", async () => {
  const h = setup(); h.request(); h.event("pause");
  await deliver();
  expect(h.result.current.active).toBe(false);
  act(() => h.result.current.finish()); h.attach();
  expect(h.play).not.toHaveBeenCalled();
});

it("can resume a cached ad after cancelling loading intent", async () => {
  const h = setup(); h.request(); h.event("pause"); await deliver();
  expect(h.request()).toBe(true); expect(h.result.current.active).toBe(true);
  expect(h.result.current.ad).toEqual(AD); expect(loadVast).toHaveBeenCalledOnce();
});

it("fails open on no fill and only starts content after its source attaches", async () => {
  const h = setup(); h.request(); await deliver(null);
  expect(h.result.current.blocked).toBe(false); expect(h.result.current.ad).toBeNull();
  expect(h.play).not.toHaveBeenCalled(); h.attach(); expect(h.play).toHaveBeenCalledOnce();
});

it("releases pending intent when configuration resolves disabled", () => {
  const h = setup(undefined); h.request(); h.rerender({ id: "v1", url: null });
  expect(h.result.current.blocked).toBe(false); h.attach(); expect(h.play).toHaveBeenCalledOnce();
  expect(loadVast).not.toHaveBeenCalled();
});

it("aborts old video loads and ignores their late completion", async () => {
  const h = setup(); h.request();
  const signal = loadVast.mock.calls[0][1] as AbortSignal, oldResolve = resolveAd;
  h.rerender({ id: "v2", url: "/vast" });
  expect(signal.aborted).toBe(true); expect(h.result.current.blocked).toBe(true);
  expect(h.result.current.active).toBe(false);
  await act(async () => { oldResolve(AD); });
  expect(h.result.current.ad).toBeNull(); h.attach(); expect(h.play).not.toHaveBeenCalled();
  h.request(); expect(loadVast).toHaveBeenCalledTimes(2);
});

it("aborts on unmount and never resumes from a late response", async () => {
  const h = setup(); h.request(); const signal = loadVast.mock.calls[0][1] as AbortSignal;
  h.unmount(); expect(signal.aborted).toBe(true); await deliver(null); h.attach();
  expect(h.play).not.toHaveBeenCalled();
});

it("cancels a released handoff when an external pause arrives before attachment", async () => {
  const h = setup(); h.request(); await deliver(); act(() => h.result.current.finish());
  h.event("pause"); h.attach(); expect(h.play).not.toHaveBeenCalled();
});

it("honours an API pause request even when content is already internally paused", async () => {
  const h = setup(); act(() => { void h.video.play(); });
  h.event("vidra:pause-request"); h.event("pause");
  await deliver(); act(() => h.result.current.finish()); h.attach();
  expect(h.play).toHaveBeenCalledOnce();
});

it("restores an externally requested content position after attachment resets it", async () => {
  const h = setup(); h.video.currentTime = 75;
  act(() => { void h.video.play(); }); h.event("pause");
  await deliver(); act(() => h.result.current.finish());
  h.video.currentTime = 0; h.attach(); h.event("loadedmetadata");
  expect(h.video.currentTime).toBe(75);
  h.video.currentTime = 80; h.event("loadedmetadata");
  expect(h.video.currentTime).toBe(80); // only the initial handoff restores it
});

it("keeps blocked play and pause signals away from content analytics and embed listeners", async () => {
  const h = setup(), downstreamPlay = vi.fn(), downstreamPause = vi.fn();
  h.video.addEventListener("play", downstreamPlay); h.video.addEventListener("pause", downstreamPause);
  act(() => { void h.video.play(); }); h.event("pause"); h.event("pause");
  expect(downstreamPlay).not.toHaveBeenCalled(); expect(downstreamPause).not.toHaveBeenCalled();
  await deliver(); act(() => h.result.current.finish());
  act(() => { void h.video.play(); }); h.event("pause");
  expect(downstreamPlay).toHaveBeenCalledOnce(); expect(downstreamPause).toHaveBeenCalledOnce();
});

it("replaces an unfinished ad when the configured tag changes on the same video", async () => {
  const h = setup(); h.request(); await deliver();
  const signal = loadVast.mock.calls[0][1] as AbortSignal;
  h.rerender({ id: "v1", url: "/new-vast" });
  expect(signal.aborted).toBe(true); expect(loadVast).toHaveBeenCalledTimes(2);
  expect(h.result.current.ad).toBeNull(); expect(h.result.current.active).toBe(true);
  await deliver(null); expect(h.result.current.blocked).toBe(false);
});

it("checks current cooldown on intent and releases content without fetching another ad", () => {
  const h = setup("/vast", 60);
  expect(canPlayVast).not.toHaveBeenCalled(); canPlayVast.mockReturnValue(false);
  expect(h.request()).toBe(true); expect(canPlayVast).toHaveBeenCalledWith(60);
  expect(loadVast).not.toHaveBeenCalled(); expect(h.result.current.blocked).toBe(false);
  expect(h.result.current.active).toBe(false); h.attach(); expect(h.play).toHaveBeenCalledOnce();
});

it("holds an explicit API play request before native autoplay policy can reject it", async () => {
  const h = setup(); let allowed = true;
  const request = () => act(() => { allowed = h.video.dispatchEvent(new Event("vidra:play-request", { cancelable: true })); });
  request(); expect(allowed).toBe(false); expect(loadVast).toHaveBeenCalledOnce();
  expect(h.play).not.toHaveBeenCalled(); expect(h.result.current.active).toBe(true);
  await deliver(); act(() => h.result.current.finish()); request(); expect(allowed).toBe(true);
});
