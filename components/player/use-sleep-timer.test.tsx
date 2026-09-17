// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSleepTimer } from "./use-sleep-timer";
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it("pauses at the deadline and suppresses autoplay until an explicit play", () => {
  vi.useFakeTimers();
  const video = document.createElement("video");
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  const { result } = renderHook(() => useSleepTimer({ current: video }, "v1"));
  act(() => result.current.select("10"));
  act(() => vi.advanceTimersByTime(600000));
  expect(pause).toHaveBeenCalledOnce();
  expect(result.current.expired).toBe(true);
  act(() => video.dispatchEvent(new Event("play")));
  expect(result.current.expired).toBe(false);
});
it("supports end-of-video and cancels the old timer on replacement or navigation", () => {
  vi.useFakeTimers();
  const video = document.createElement("video");
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  const ref = { current: video };
  const { result, rerender } = renderHook(({ id }) => useSleepTimer(ref, id), { initialProps: { id: "v1" } });
  act(() => result.current.select("10"));
  act(() => result.current.select("end"));
  act(() => vi.advanceTimersByTime(600000));
  expect(pause).not.toHaveBeenCalled();
  act(() => video.dispatchEvent(new Event("ended")));
  expect(result.current.expired).toBe(true);
  act(() => result.current.select("10"));
  rerender({ id: "v2" });
  act(() => vi.advanceTimersByTime(600000));
  expect(pause).toHaveBeenCalledOnce();
  expect(result.current.value).toBe("off");
});
it("does not revive a cancelled timer when navigating back to its video", () => {
  vi.useFakeTimers();
  const video = document.createElement("video");
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  const ref = { current: video };
  const { result, rerender } = renderHook(({ id }) => useSleepTimer(ref, id), { initialProps: { id: "v1" } });
  act(() => result.current.select("10"));
  rerender({ id: "v2" });
  rerender({ id: "v1" });
  expect(result.current.value).toBe("off");
  act(() => vi.advanceTimersByTime(600000));
  expect(pause).not.toHaveBeenCalled();
  expect(result.current.expired).toBe(false);
});
