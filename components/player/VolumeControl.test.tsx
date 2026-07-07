// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VolumeControl } from "./VolumeControl";

afterEach(cleanup);

describe("VolumeControl", () => {
  it("labels the mute toggle and fires onToggleMute", () => {
    const onToggleMute = vi.fn();
    render(
      <VolumeControl volume={0.5} muted={false} onToggleMute={onToggleMute} onSetVolume={() => {}} />,
    );
    const mute = screen.getByRole("button", { name: "Mute" });
    expect(mute.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(mute);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  it("reads the level on the slider and steps ±5% on arrows", () => {
    const onSetVolume = vi.fn();
    render(
      <VolumeControl volume={0.5} muted={false} onToggleMute={() => {}} onSetVolume={onSetVolume} />,
    );
    const slider = screen.getByRole("slider", { name: "Volume" });
    expect(slider.getAttribute("aria-valuenow")).toBe("50");
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(onSetVolume).toHaveBeenLastCalledWith(0.55);
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(onSetVolume).toHaveBeenLastCalledWith(0.45);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(onSetVolume).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: "End" });
    expect(onSetVolume).toHaveBeenLastCalledWith(1);
  });

  it("reads 'Unmute' + pressed + 0% while muted", () => {
    render(
      <VolumeControl volume={0.8} muted onToggleMute={() => {}} onSetVolume={() => {}} />,
    );
    const mute = screen.getByRole("button", { name: "Unmute" });
    expect(mute.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("slider", { name: "Volume" }).getAttribute("aria-valuenow")).toBe("0");
  });

  it("steps up from 0 when muted (treats the muted level as 0)", () => {
    const onSetVolume = vi.fn();
    render(
      <VolumeControl volume={0.8} muted onToggleMute={() => {}} onSetVolume={onSetVolume} />,
    );
    fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), { key: "ArrowUp" });
    expect(onSetVolume).toHaveBeenLastCalledWith(0.05);
  });
});
