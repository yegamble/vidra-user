// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PlaybackFeedback } from "./PlaybackFeedback";
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("briefly shows each play/pause transition, then clears even while paused", () => {
  vi.useFakeTimers();
  const { rerender } = render(<PlaybackFeedback key="paused" paused />);
  expect(screen.getByTestId("playback-feedback")).toBeTruthy();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.queryByTestId("playback-feedback")).toBeNull();
  rerender(<PlaybackFeedback key="playing" paused={false} />);
  expect(screen.getByTestId("playback-feedback")).toBeTruthy();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.queryByTestId("playback-feedback")).toBeNull();
});
