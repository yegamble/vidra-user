// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadVast } from "@/lib/vast-client";
import { canPlayVast } from "@/lib/vast-cooldown";
import { useVastBreaks } from "./use-vast-breaks";

vi.mock("@/lib/vast-client", () => ({ loadVast: vi.fn() }));
vi.mock("@/lib/vast-cooldown", () => ({ canPlayVast: vi.fn(() => true) }));
afterEach(() => vi.restoreAllMocks());

function setup(offsetPercent = 0, stopAt: number | null = null) {
  const el = document.createElement("video");
  Object.defineProperty(el, "paused", { configurable: true, value: false });
  Object.defineProperty(el, "duration", { configurable: true, value: 120 });
  vi.spyOn(el, "pause").mockImplementation(() => {});
  vi.spyOn(el, "play").mockResolvedValue();
  const ref = { current: el };
  const hook = renderHook(() => useVastBreaks(ref, "v1", "https://ads.test/mid", 30, "https://ads.test/post", 0, 0, offsetPercent, stopAt));
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

it("uses the actual media duration for a percentage rather than metadata-derived seconds", () => {
  vi.mocked(loadVast).mockClear().mockImplementation(() => new Promise(() => {}));
  const { el, result } = setup(50);
  act(() => { el.currentTime = 30; el.dispatchEvent(new Event("timeupdate")); });
  expect(loadVast).not.toHaveBeenCalled();
  Object.defineProperty(el, "duration", { value: 240 });
  act(() => { el.currentTime = 60; el.dispatchEvent(new Event("timeupdate")); });
  expect(loadVast).not.toHaveBeenCalled();
  act(() => { el.currentTime = 120; el.dispatchEvent(new Event("timeupdate")); });
  expect(result.current.active).toBe(true);
  expect(loadVast).toHaveBeenCalledExactlyOnceWith("https://ads.test/mid", expect.any(AbortSignal));
});

it("leaves 100 percent to the post-roll without requesting a duplicate mid-roll", async () => {
  vi.mocked(loadVast).mockClear().mockResolvedValue({ mediaUrl: "https://ads.test/ad.mp4" } as never);
  const { el, result } = setup(100);
  act(() => { el.currentTime = 120; el.dispatchEvent(new Event("timeupdate")); });
  expect(loadVast).not.toHaveBeenCalled();
  const ended = vi.fn();
  el.addEventListener("ended", ended);
  act(() => el.dispatchEvent(new Event("ended")));
  await waitFor(() => expect(result.current.ad).not.toBeNull());
  expect(loadVast).toHaveBeenCalledExactlyOnceWith("https://ads.test/post", expect.any(AbortSignal));
  expect(ended).not.toHaveBeenCalled();
  act(() => result.current.finish());
  expect(ended).toHaveBeenCalledOnce();
});

it.each([[20, 30], [30, 30], [40, 45]])("leaves clip stop %s visible to the embed at content time %s", (stopAt, at) => {
  vi.mocked(loadVast).mockClear().mockImplementation(() => new Promise(() => {}));
  const { el, result } = setup(0, stopAt);
  const onTime = vi.fn();
  el.addEventListener("timeupdate", onTime);
  act(() => { el.currentTime = at; el.dispatchEvent(new Event("timeupdate")); });
  expect(loadVast).not.toHaveBeenCalled();
  expect(result.current.active).toBe(false);
  expect(onTime).toHaveBeenCalledOnce();
});

it("still requests a mid-roll before the clip stop", () => {
  vi.mocked(loadVast).mockClear().mockImplementation(() => new Promise(() => {}));
  const { el, result } = setup(0, 40);
  act(() => { el.currentTime = 30; el.dispatchEvent(new Event("timeupdate")); });
  expect(result.current.active).toBe(true);
  expect(loadVast).toHaveBeenCalledExactlyOnceWith("https://ads.test/mid", expect.any(AbortSignal));
});

function repeating(interval = 900, cooldown = 0) {
  vi.mocked(loadVast).mockClear().mockResolvedValue(null);
  const el = document.createElement("video");
  Object.defineProperty(el, "paused", { configurable: true, value: false });
  Object.defineProperty(el, "duration", { configurable: true, value: 3600 });
  vi.spyOn(el, "pause").mockImplementation(() => {});
  vi.spyOn(el, "play").mockResolvedValue();
  const ref = { current: el };
  const hook = renderHook(() => useVastBreaks(ref, "long", "https://ads.test/mid", 300, null, 0, cooldown, 0, null, interval));
  const playTo = async (time: number) => { await act(async () => { el.currentTime = time; el.dispatchEvent(new Event("timeupdate")); }); };
  return { el, playTo, ...hook };
}

it("requests the mid-roll tag again at every interval after the first position", async () => {
  const { playTo } = repeating();
  await playTo(299);
  expect(loadVast).not.toHaveBeenCalled();
  await playTo(300);
  expect(loadVast).toHaveBeenCalledTimes(1);
  await playTo(1199);
  expect(loadVast).toHaveBeenCalledTimes(1);
  await playTo(1200);
  expect(loadVast).toHaveBeenCalledTimes(2);
  await playTo(2100);
  expect(loadVast).toHaveBeenCalledTimes(3);
  await playTo(2100);
  expect(loadVast).toHaveBeenCalledTimes(3);
});

it("keeps a single mid-roll when the interval is 0", async () => {
  const { playTo } = repeating(0);
  await playTo(300);
  await playTo(1200);
  await playTo(3000);
  expect(loadVast).toHaveBeenCalledTimes(1);
});

it("skips a break inside the cooldown instead of deferring it, and plays the next one", async () => {
  vi.mocked(canPlayVast).mockReturnValueOnce(false);
  const { playTo, result } = repeating(900, 300);
  await playTo(300);
  expect(canPlayVast).toHaveBeenLastCalledWith(300);
  expect(loadVast).not.toHaveBeenCalled();
  await playTo(600);
  expect(loadVast).not.toHaveBeenCalled();
  expect(result.current.active).toBe(false);
  await playTo(1200);
  expect(loadVast).toHaveBeenCalledTimes(1);
});

it("plays one break after a seek past several points and none after seeking back", async () => {
  const { playTo } = repeating();
  await playTo(2500);
  expect(loadVast).toHaveBeenCalledTimes(1);
  await playTo(400);
  await playTo(1300);
  await playTo(2600);
  expect(loadVast).toHaveBeenCalledTimes(1);
  await playTo(3000);
  expect(loadVast).toHaveBeenCalledTimes(2);
});

it("places no repeat inside the last 60 seconds", async () => {
  const { el, playTo } = repeating();
  Object.defineProperty(el, "duration", { configurable: true, value: 3050 });
  await playTo(2100);
  expect(loadVast).toHaveBeenCalledTimes(1);
  await playTo(3040);
  expect(loadVast).toHaveBeenCalledTimes(1);
});
