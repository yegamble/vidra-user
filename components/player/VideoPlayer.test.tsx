// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VideoPlayer, type CaptionTrack } from "./VideoPlayer";
import type { Video } from "@/lib/api";

const VIDEO = {
  id: "v1",
  channel_id: "c1",
  title: "Clip",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  has_thumbnail: false,
  duration_seconds: 120,
  // no hls_url → progressive "original" mode (no hls.js import in jsdom)
} as unknown as Video;

function Harness({ tracks = [] as CaptionTrack[] }: { tracks?: CaptionTrack[] }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  return <VideoPlayer video={VIDEO} videoRef={ref} startAt={null} tracks={tracks} />;
}

beforeEach(() => {
  // jsdom does not implement media playback — stub the transport the shell calls.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VideoPlayer shell", () => {
  it("renders a chrome-less video (no native controls) under a custom overlay", () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.hasAttribute("controls")).toBe(false);
    // The custom control surface: seek + volume sliders and the core buttons.
    expect(screen.getByRole("slider", { name: "Seek" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Volume" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fullscreen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Speed: Normal" })).toBeTruthy();
  });

  it("hides the quality selector and captions toggle when neither is available", () => {
    render(<Harness />);
    // Original playback → no selectable levels → no quality menu.
    expect(screen.queryByRole("button", { name: /^Quality:/ })).toBeNull();
    // No caption tracks → no captions toggle.
    expect(screen.queryByRole("button", { name: "Captions" })).toBeNull();
  });

  it("shows a captions toggle when the video carries tracks", () => {
    render(<Harness tracks={[{ language: "en", label: "English", url: "blob:cc" }]} />);
    const cc = screen.getByRole("button", { name: "Captions" });
    expect(cc.getAttribute("aria-pressed")).toBe("false");
  });

  it("drives play/pause and reflects the media state", () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    // The button label follows the element's play/pause events.
    act(() => void fireEvent(video, new Event("play")));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    act(() => void fireEvent(video, new Event("pause")));
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("opens the speed menu, applies the rate, and relabels the button", () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent.click(screen.getByRole("button", { name: "Speed: Normal" }));
    const menu = screen.getByRole("menu", { name: "Playback speed" });
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "1.5×" }));
    expect(screen.getByRole("button", { name: "Speed: 1.5×" })).toBeTruthy();
    expect(video.playbackRate).toBe(1.5);
  });

  it("pins the controls while paused and auto-hides ~3s after playback starts", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Harness />);
      const video = container.querySelector("video") as HTMLVideoElement;
      const bar = screen.getByTestId("player-controls");
      // Paused on mount → controls pinned visible.
      expect(bar.className).toContain("opacity-100");
      // Playback starts → countdown → hidden (opacity only, never display).
      act(() => void fireEvent(video, new Event("play")));
      act(() => void vi.advanceTimersByTime(3000));
      expect(bar.className).toContain("opacity-0");
      expect(bar.className).toContain("pointer-events-none");
      // Pausing pins them visible again.
      act(() => void fireEvent(video, new Event("pause")));
      expect(bar.className).toContain("opacity-100");
    } finally {
      vi.useRealTimers();
    }
  });
});
