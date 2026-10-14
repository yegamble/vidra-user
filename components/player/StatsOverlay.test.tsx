// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatsOverlay } from "./StatsOverlay";

afterEach(cleanup);

function mount(onClose = vi.fn()) {
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", { value: 640 });
  Object.defineProperty(video, "videoHeight", { value: 360 });
  render(<StatsOverlay videoRef={{ current: video }} engineName="hls-js" onClose={onClose}
    getEngine={() => ({ currentLevel: 0, levels: [{ bitrate: 1_000_000, videoCodec: "avc1" }] })} />);
  return onClose;
}

describe("StatsOverlay", () => {
  it("shows resolution, bitrate and codec as a named group and focuses its close button", () => {
    mount();
    expect(screen.getByRole("group", { name: "Playback statistics" })).toBeTruthy();
    expect(screen.getByText("640×360")).toBeTruthy();
    expect(screen.getByText("1.0 Mbps")).toBeTruthy();
    expect(screen.getByText("avc1")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close statistics" }));
  });

  it("closes on Escape and on the close button", () => {
    const onClose = mount();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close statistics" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close statistics" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
