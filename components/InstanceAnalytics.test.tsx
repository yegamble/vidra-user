// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InstanceAnalytics } from "./InstanceAnalytics";

const mocks = vi.hoisted(() => ({ get: vi.fn(), features: vi.fn(), runtime: vi.fn() }));
vi.mock("@/lib/api/instance-platform", () => ({ getInstanceCached: mocks.get }));
vi.mock("@/lib/instance-features", () => ({ INSTANCE_FEATURES_EVENT: "instance-refresh", getInstanceFeaturesSnapshot: mocks.features }));
vi.mock("./GoogleAnalytics", () => ({ GoogleAnalytics: mocks.runtime }));
const enabled = { google_enabled: true, google_measurement_id: "G-TEST1234" };
const props = () => mocks.runtime.mock.calls.at(-1)?.[0];
beforeEach(() => { mocks.get.mockReset().mockResolvedValue({}); mocks.features.mockReset().mockReturnValue(null); mocks.runtime.mockReset().mockReturnValue(null); });
afterEach(cleanup);

it("passes the SSR snapshot and nonce without fetching again", () => {
  render(<InstanceAnalytics analytics={enabled} nonce="request-nonce" />);
  expect(props()).toEqual({ enabled: true, measurementId: "G-TEST1234", nonce: "request-nonce" });
  expect(mocks.get).not.toHaveBeenCalled();
});
it("keeps the runtime mounted with disabled props for older or disabled servers", () => {
  const view = render(<InstanceAnalytics analytics={null} nonce="nonce" />);
  expect(props().enabled).toBe(false);
  view.rerender(<InstanceAnalytics analytics={{ ...enabled, google_enabled: false }} nonce="nonce" />);
  expect(props().enabled).toBe(false);
  expect(props().measurementId).toBe("");
  expect(mocks.get).not.toHaveBeenCalled();
});
it("recovers from an unavailable SSR read using the shared public instance fetch", async () => {
  mocks.get.mockResolvedValue({ analytics: enabled });
  render(<InstanceAnalytics analytics={undefined} nonce="nonce" />);
  expect(mocks.runtime.mock.calls[0][0].enabled).toBe(false);
  await waitFor(() => expect(props().enabled).toBe(true));
  expect(mocks.get).toHaveBeenCalledOnce();
});
it("fails closed on a failed fallback read", async () => {
  mocks.get.mockRejectedValue(new Error("offline"));
  render(<InstanceAnalytics analytics={undefined} nonce="nonce" />);
  await act(async () => {});
  expect(props()).toMatchObject({ enabled: false, measurementId: "" });
});
it("disables immediately on admin invalidation and rejects superseded replies", async () => {
  let late!: (value: { analytics: typeof enabled }) => void;
  mocks.get.mockImplementationOnce(() => new Promise(resolve => { late = resolve; })).mockResolvedValueOnce({});
  render(<InstanceAnalytics analytics={enabled} nonce="nonce" />);
  act(() => { window.dispatchEvent(new Event("instance-refresh")); });
  expect(props().enabled).toBe(false);
  await act(async () => { window.dispatchEvent(new Event("instance-refresh")); });
  await act(async () => { late({ analytics: enabled }); });
  expect(props().enabled).toBe(false);
});
it("ignores bootstrap completion and accepts a fresh SSR configuration", () => {
  mocks.features.mockReturnValue({ uploads: true });
  const view = render(<InstanceAnalytics analytics={null} nonce="nonce" />);
  act(() => { window.dispatchEvent(new Event("instance-refresh")); });
  expect(mocks.get).not.toHaveBeenCalled();
  view.rerender(<InstanceAnalytics analytics={enabled} nonce="nonce" />);
  expect(props().enabled).toBe(true);
});
