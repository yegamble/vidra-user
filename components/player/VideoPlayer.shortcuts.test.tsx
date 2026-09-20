// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Video } from "@/lib/api";
import { resetPlayerSettings } from "@/lib/player-settings";
import { VideoPlayer } from "./VideoPlayer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const VIDEO = { id: "shortcut-video", channel_id: "c1", title: "Clip", privacy: "public",
  state: "published", created_at: "2026-09-17T00:00:00Z", has_thumbnail: false,
  duration_seconds: 120 } as Video;
function Harness() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  return <VideoPlayer video={VIDEO} videoRef={videoRef} startAt={null} tracks={[]} variant="watch" />;
}
function press(target: Element, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true,
    cancelable: true, ...init });
  fireEvent(target, event);
  return event;
}
function player() {
  const { container } = render(<Harness />);
  const video = container.querySelector("video")!;
  vi.mocked(video.play).mockClear();
  return video;
}
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); resetPlayerSettings(); });

describe("watch player Space shortcut", () => {
  it("toggles a focused custom video and prevents page scrolling", () => {
    const video = player();
    video.tabIndex = 0;
    video.focus();
    expect(video.controls).toBe(false);
    expect(press(document.activeElement!).defaultPrevented).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);
    Object.defineProperty(video, "paused", { configurable: true, get: () => false });
    expect(press(video).defaultPrevented).toBe(true);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it.each(["input", "textarea", "select", "button", "a", "video", "editable"])(
    "preserves Space on %s controls", (tag) => {
      const video = player();
      const target = tag === "video" ? video : document.createElement(tag === "editable" ? "div" : tag);
      if (tag === "video") video.controls = true;
      if (tag === "editable") target.setAttribute("contenteditable", "true");
      if (target !== video) document.body.append(target);
      expect(press(target).defaultPrevented).toBe(false);
      expect(video.play).not.toHaveBeenCalled();
      if (target !== video) target.remove();
    });

  it.each(["ctrlKey", "metaKey", "altKey", "isComposing"])("preserves %s presses", (modifier) => {
    const video = player();
    expect(press(document.body, { [modifier]: true }).defaultPrevented).toBe(false);
    expect(video.play).not.toHaveBeenCalled();
  });

  it("consumes repeated Space without toggling repeatedly, while held seeking still works", () => {
    const video = player();
    expect(press(document.body).defaultPrevented).toBe(true);
    expect(press(document.body, { repeat: true }).defaultPrevented).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);
    video.currentTime = 10;
    expect(press(document.body, { key: "ArrowRight", code: "ArrowRight", repeat: true })
      .defaultPrevented).toBe(true);
    expect(video.currentTime).toBe(15);
  });
});
