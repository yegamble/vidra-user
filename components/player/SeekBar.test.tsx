// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeekBar } from "./SeekBar";

afterEach(cleanup);

describe("SeekBar", () => {
  it("exposes the ARIA slider contract (min/max/now + 'elapsed of total' text)", () => {
    render(<SeekBar currentTime={30} duration={120} buffered={[]} onSeek={() => {}} />);
    const slider = screen.getByRole("slider", { name: "Seek" });
    expect(slider.getAttribute("aria-valuemin")).toBe("0");
    expect(slider.getAttribute("aria-valuemax")).toBe("120");
    expect(slider.getAttribute("aria-valuenow")).toBe("30");
    expect(slider.getAttribute("aria-valuetext")).toBe("0:30 of 2:00");
    expect(slider.getAttribute("tabindex")).toBe("0");
  });

  it("steps ±5s on arrows and jumps to the ends on Home/End", () => {
    const onSeek = vi.fn();
    render(<SeekBar currentTime={30} duration={120} buffered={[]} onSeek={onSeek} />);
    const slider = screen.getByRole("slider", { name: "Seek" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(35);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenLastCalledWith(25);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(onSeek).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: "End" });
    expect(onSeek).toHaveBeenLastCalledWith(120);
  });

  it("clamps the seek step to the duration bounds", () => {
    const onSeek = vi.fn();
    render(<SeekBar currentTime={118} duration={120} buffered={[]} onSeek={onSeek} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Seek" }), { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(120); // 118+5 clamped to 120
  });

  it("does nothing on keys while the duration is unknown", () => {
    const onSeek = vi.fn();
    render(<SeekBar currentTime={0} duration={0} buffered={[]} onSeek={onSeek} />);
    const slider = screen.getByRole("slider", { name: "Seek" });
    expect(slider.getAttribute("aria-valuemax")).toBe("0");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("paints a buffered band from the ranges", () => {
    const { container } = render(
      <SeekBar currentTime={0} duration={120} buffered={[[0, 60]]} onSeek={() => {}} />,
    );
    // The buffered band is a 50%-wide element (0..60 of 120).
    const band = container.querySelector('[style*="width: 50%"]');
    expect(band).not.toBeNull();
  });
});
