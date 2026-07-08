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

  it("previews the storyboard frame in the scrub bubble and lazily activates it", () => {
    const activate = vi.fn();
    const cue = { start: 2, end: 4, x: 160, y: 0, w: 160, h: 90 };
    const storyboard = {
      cueAt: () => cue,
      spriteUrl: "http://api.test/api/v1/videos/v1/storyboard.jpg",
      activate,
    };
    const { container } = render(
      <SeekBar currentTime={0} duration={120} buffered={[]} onSeek={() => {}} storyboard={storyboard} />,
    );
    const slider = screen.getByRole("slider", { name: "Seek" });
    // Focus shows the bubble (keyboard parity) AND triggers the lazy fetch.
    fireEvent.focus(slider);
    expect(activate).toHaveBeenCalled();
    const frame = container.querySelector('div[style*="storyboard.jpg"]') as HTMLElement | null;
    expect(frame).not.toBeNull();
    expect(frame!.style.width).toBe("160px");
    expect(frame!.style.height).toBe("90px");
  });

  it("activates the storyboard on hover as well as focus", () => {
    const activate = vi.fn();
    const storyboard = {
      cueAt: () => null,
      spriteUrl: "http://api.test/api/v1/videos/v1/storyboard.jpg",
      activate,
    };
    render(
      <SeekBar currentTime={0} duration={120} buffered={[]} onSeek={() => {}} storyboard={storyboard} />,
    );
    fireEvent.pointerMove(screen.getByRole("slider", { name: "Seek" }), { clientX: 40 });
    expect(activate).toHaveBeenCalled();
  });

  it("paints a chapter boundary tick per chapter (skipping 0s and out-of-range starts)", () => {
    const chapters = {
      chapters: [
        { start_seconds: 0, title: "Intro" },
        { start_seconds: 60, title: "Middle" },
        { start_seconds: 120, title: "End" },
        { start_seconds: 999, title: "Past the end" },
      ],
      chapterAt: () => null,
    };
    render(
      <SeekBar currentTime={0} duration={200} buffered={[]} onSeek={() => {}} chapters={chapters} />,
    );
    // 0s (left edge) and the 999s (past the 200s duration) ticks are skipped → 2.
    expect(screen.getAllByTestId("chapter-tick")).toHaveLength(2);
  });

  it("renders no ticks when the video has no chapters", () => {
    render(<SeekBar currentTime={0} duration={200} buffered={[]} onSeek={() => {}} />);
    expect(screen.queryAllByTestId("chapter-tick")).toHaveLength(0);
  });

  it("shows the chapter title in the scrub bubble and in the playhead aria-valuetext", () => {
    const chapters = {
      chapters: [{ start_seconds: 0, title: "Cold Open" }],
      chapterAt: () => ({ start_seconds: 0, title: "Cold Open" }),
    };
    render(
      <SeekBar currentTime={30} duration={120} buffered={[]} onSeek={() => {}} chapters={chapters} />,
    );
    const slider = screen.getByRole("slider", { name: "Seek" });
    // The playhead's chapter is announced through aria-valuetext.
    expect(slider.getAttribute("aria-valuetext")).toBe("0:30 of 2:00 — Cold Open");
    // Focusing shows the scrub bubble, which carries the chapter title.
    fireEvent.focus(slider);
    expect(screen.getByText("Cold Open")).toBeTruthy();
  });

  it("degrades to a time-only bubble when the storyboard has no cue for the position", () => {
    const storyboard = {
      cueAt: () => null,
      spriteUrl: "http://api.test/api/v1/videos/v1/storyboard.jpg",
      activate: vi.fn(),
    };
    const { container } = render(
      <SeekBar currentTime={0} duration={120} buffered={[]} onSeek={() => {}} storyboard={storyboard} />,
    );
    fireEvent.focus(screen.getByRole("slider", { name: "Seek" }));
    // The bubble still shows the timestamp, but paints no sprite frame.
    expect(container.querySelector('div[style*="storyboard.jpg"]')).toBeNull();
    expect(screen.getByText("0:00")).toBeTruthy();
  });
});
