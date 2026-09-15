// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AmbientGlow } from "./AmbientGlow";

// jsdom ships no 2D context (no `canvas` package), so getContext() returns null
// and the component would bail before drawing. Stub a context whose drawImage
// is observable — that call IS the frame sample.
const drawImage = vi.fn();

function stubCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
}

// The component reads prefers-reduced-motion once at mount; jsdom has no
// matchMedia at all, so every test states the answer explicitly.
function stubMatchMedia(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** A <video> that reports itself as playing with a decodable frame ready. */
function playingVideo() {
  const el = document.createElement("video");
  Object.defineProperty(el, "paused", { value: false, configurable: true, writable: true });
  Object.defineProperty(el, "ended", { value: false, configurable: true, writable: true });
  Object.defineProperty(el, "readyState", { value: 2, configurable: true, writable: true });
  document.body.appendChild(el);
  const ref = createRef<HTMLVideoElement | null>() as React.RefObject<HTMLVideoElement | null>;
  ref.current = el;
  return { el, ref };
}

beforeEach(() => {
  drawImage.mockClear();
  stubCanvas();
  stubMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("AmbientGlow", () => {
  it("renders a decorative poster layer plus the two cross-fading sample canvases", () => {
    const { container } = render(<AmbientGlow posterUrl="https://cdn.example/poster.jpg" />);

    const glow = container.querySelector('[data-testid="ambient-glow"]');
    expect(glow).not.toBeNull();
    // Purely decorative — never in the accessibility tree.
    expect(glow?.getAttribute("aria-hidden")).toBe("true");
    // The edge falloff + blur live in one class (app/globals.css) so the mask
    // numbers are tuned in one documented place, not scattered in utilities.
    expect(glow?.classList.contains("ambient-glow")).toBe(true);
    // No overflow clipping on the glow itself — that is what made it a box.
    expect(glow?.className).not.toContain("overflow-hidden");
    // The poster paints as a background image (no second <img> fetch).
    const poster = glow?.querySelector('[data-testid="ambient-glow-poster"]');
    expect(poster?.getAttribute("style")).toContain('url("https://cdn.example/poster.jpg")');
    expect(container.querySelector("img")).toBeNull();
    // Two stacked canvases so a new sample cross-fades in over the old one.
    expect(glow?.querySelectorAll("canvas")).toHaveLength(2);
  });

  it("renders nothing when there is neither a poster nor a video element", () => {
    const { container } = render(<AmbientGlow posterUrl={null} />);
    expect(container.querySelector('[data-testid="ambient-glow"]')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("still lights up from the video when the upload has no poster", () => {
    const { ref } = playingVideo();
    const { container } = render(<AmbientGlow posterUrl={null} videoRef={ref} />);
    expect(container.querySelector('[data-testid="ambient-glow"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ambient-glow-poster"]')).toBeNull();
    expect(container.querySelectorAll("canvas")).toHaveLength(2);
  });

  it("samples the playing frame on a slow interval and stops when the video pauses", () => {
    vi.useFakeTimers();
    const { el, ref } = playingVideo();
    render(<AmbientGlow posterUrl="https://cdn.example/poster.jpg" videoRef={ref} />);

    expect(drawImage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(drawImage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(drawImage).toHaveBeenCalledTimes(2);

    // Pause freezes the last frame: the interval is torn down, not merely idled.
    Object.defineProperty(el, "paused", { value: true, configurable: true, writable: true });
    el.dispatchEvent(new Event("pause"));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(drawImage).toHaveBeenCalledTimes(2);
  });

  it("never samples under prefers-reduced-motion — the static poster glow only", () => {
    stubMatchMedia(true);
    vi.useFakeTimers();
    const { ref } = playingVideo();
    render(<AmbientGlow posterUrl="https://cdn.example/poster.jpg" videoRef={ref} />);

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(drawImage).not.toHaveBeenCalled();
  });
});
