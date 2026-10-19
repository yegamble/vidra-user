// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadVast } from "@/lib/vast-client";
import { useVastBreaks } from "./use-vast-breaks";

vi.mock("@/lib/vast-client", () => ({ loadVast: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

function setup() {
  const el = document.createElement("video");
  Object.defineProperty(el, "paused", { configurable: true, value: false });
  Object.defineProperty(el, "duration", { configurable: true, value: 120 });
  vi.spyOn(el, "pause").mockImplementation(() => {});
  vi.spyOn(el, "play").mockResolvedValue();
  const ref = { current: el };
  const hook = renderHook(() => useVastBreaks(ref, "v1", "https://ads.test/mid", 30, "https://ads.test/post"));
  return { el, ...hook };
}

it("pauses mid-roll at its configured position and resumes once after failure", async () => {
  let resolve!: (ad: null) => void;
  vi.mocked(loadVast).mockImplementation(() => new Promise(r => { resolve = r; }));
  const { el, result } = setup();
  act(() => { el.currentTime = 31; el.dispatchEvent(new Event("timeupdate")); });
  expect(result.current.active).toBe(true);
  expect(el.pause).toHaveBeenCalled();
  act(() => { el.currentTime = 70; el.dispatchEvent(new Event("seeking")); });
  expect(el.currentTime).toBe(31);
  await act(async () => resolve(null));
  expect(result.current.active).toBe(false);
  expect(el.play).toHaveBeenCalledTimes(1);
  act(() => el.dispatchEvent(new Event("timeupdate")));
  expect(loadVast).toHaveBeenCalledTimes(1);
});

it("holds content-ended listeners until the post-roll finishes", async () => {
  vi.mocked(loadVast).mockResolvedValue({ mediaUrl: "https://ads.test/ad.mp4" } as never);
  const { el, result } = setup();
  const ended = vi.fn();
  el.addEventListener("ended", ended);
  act(() => el.dispatchEvent(new Event("ended")));
  await waitFor(() => expect(result.current.ad).not.toBeNull());
  expect(ended).not.toHaveBeenCalled();
  act(() => result.current.finish());
  expect(ended).toHaveBeenCalledTimes(1);
  expect(el.play).not.toHaveBeenCalled();
});

it("keeps an active break finishable after settings change and honors explicit pause", async () => {
  vi.mocked(loadVast).mockResolvedValue({ mediaUrl: "https://ads.test/ad.mp4" } as never);
  const el = document.createElement("video");
  Object.defineProperty(el, "paused", { value: false });
  Object.defineProperty(el, "duration", { value: 120 });
  vi.spyOn(el, "pause").mockImplementation(() => {});
  vi.spyOn(el, "play").mockResolvedValue();
  const ref = { current: el };
  const { result, rerender } = renderHook(({ url }) => useVastBreaks(ref, "v1", url, 30, null),
    { initialProps: { url: "https://ads.test/mid" as string | null } });
  act(() => { el.currentTime = 40; el.dispatchEvent(new Event("timeupdate")); });
  await waitFor(() => expect(result.current.ad).not.toBeNull());
  rerender({ url: null });
  act(() => { el.currentTime = 90; el.dispatchEvent(new Event("vidra:pause-request")); result.current.finish(); });
  expect(result.current.active).toBe(false);
  expect(el.currentTime).toBe(40);
  expect(el.play).not.toHaveBeenCalled();
});

it("does not request a mid-roll for a video below the configured minimum", () => {
  vi.mocked(loadVast).mockClear();
  const el = document.createElement("video");
  Object.defineProperty(el, "paused", { value: false });
  Object.defineProperty(el, "duration", { value: 120 });
  const ref = { current: el };
  renderHook(() => useVastBreaks(ref, "short", "https://ads.test/mid", 30, null, 600));
  act(() => { el.currentTime = 60; el.dispatchEvent(new Event("timeupdate")); });
  expect(loadVast).not.toHaveBeenCalled();
});

it("cancels an abandoned break without resuming or ending content", async () => {
  vi.mocked(loadVast).mockImplementation(() => new Promise(() => {}));
  const { el, unmount } = setup();
  act(() => el.dispatchEvent(new Event("ended")));
  const signal = vi.mocked(loadVast).mock.calls.at(-1)![1];
  unmount();
  expect(signal.aborted).toBe(true);
  expect(el.play).not.toHaveBeenCalled();
});

it("preserves embed looping after a post-roll without emitting content-ended", async () => {
  vi.mocked(loadVast).mockResolvedValue({ mediaUrl: "https://ads.test/ad.mp4" } as never);
  const { el, result } = setup();
  el.loop = true;
  act(() => el.dispatchEvent(new Event("loadedmetadata")));
  expect(el.loop).toBe(false);
  const ended = vi.fn();
  el.addEventListener("ended", ended);
  act(() => el.dispatchEvent(new Event("ended")));
  await waitFor(() => expect(result.current.ad).not.toBeNull());
  act(() => result.current.finish());
  expect(el.loop).toBe(true);
  expect(el.currentTime).toBe(0);
  expect(ended).not.toHaveBeenCalled();
  expect(el.play).toHaveBeenCalledTimes(1);
  act(() => el.dispatchEvent(new Event("timeupdate")));
  expect(el.loop).toBe(true);
});
