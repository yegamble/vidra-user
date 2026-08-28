// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVisiblePoll } from "./use-visible-poll";

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe("useVisiblePoll", () => {
  it("polls on the interval while the tab is visible", () => {
    const onPoll = vi.fn();
    renderHook(() => useVisiblePoll({ enabled: true, intervalMs: 1000, onPoll }));

    expect(onPoll).not.toHaveBeenCalled(); // no immediate tick
    act(() => void vi.advanceTimersByTime(3000));
    expect(onPoll).toHaveBeenCalledTimes(3);
  });

  // The reason the hook exists: a backgrounded admin tab polling an aggregate
  // nobody is reading is pure server load.
  it("does no work while the tab is hidden", () => {
    const onPoll = vi.fn();
    renderHook(() => useVisiblePoll({ enabled: true, intervalMs: 1000, onPoll }));

    visibility = "hidden";
    act(() => void vi.advanceTimersByTime(5000));
    expect(onPoll).not.toHaveBeenCalled();

    visibility = "visible";
    act(() => void vi.advanceTimersByTime(1000));
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it("catches up immediately on focus rather than waiting out the interval", () => {
    const onPoll = vi.fn();
    renderHook(() => useVisiblePoll({ enabled: true, intervalMs: 10_000, onPoll }));

    act(() => void window.dispatchEvent(new Event("focus")));
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all when disabled", () => {
    const onPoll = vi.fn();
    renderHook(() => useVisiblePoll({ enabled: false, intervalMs: 1000, onPoll }));

    act(() => void vi.advanceTimersByTime(5000));
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(onPoll).not.toHaveBeenCalled();
  });

  it("tears the timer and the focus listener down together", () => {
    const onPoll = vi.fn();
    const { unmount } = renderHook(() =>
      useVisiblePoll({ enabled: true, intervalMs: 1000, onPoll }),
    );

    unmount();
    act(() => void vi.advanceTimersByTime(5000));
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(onPoll).not.toHaveBeenCalled();
  });

  it("calls the latest callback without restarting the timer", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onPoll }) => useVisiblePoll({ enabled: true, intervalMs: 1000, onPoll }),
      { initialProps: { onPoll: first } },
    );

    act(() => void vi.advanceTimersByTime(900));
    rerender({ onPoll: second });
    // The timer was never restarted, so the tick still lands at 1000ms.
    act(() => void vi.advanceTimersByTime(100));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
