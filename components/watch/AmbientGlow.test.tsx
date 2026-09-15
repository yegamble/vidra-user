// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AmbientGlow, SAMPLE_INTERVAL_MS } from "./AmbientGlow";

// jsdom ships no 2D context (no `canvas` package), so getContext() returns null
// and the component would bail before drawing. Stub a context whose drawImage
// is observable — that call IS the frame sample.
const drawImage = vi.fn();

function stubCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
}

// The component SUBSCRIBES to prefers-reduced-motion (lib/use-prefers-reduced-
// motion.ts); jsdom has no matchMedia at all, so every test states the answer
// and keeps the listeners so the preference can be flipped mid-test.
let reducedMotionListeners: Array<(e: MediaQueryListEvent) => void> = [];

function stubMatchMedia(reduced: boolean) {
  reducedMotionListeners = [];
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: (_t: string, fn: (e: MediaQueryListEvent) => void) => {
      // Once flipped, the store must report the new answer, not the old stub.
      reducedMotionListeners.push((e) => {
        stubMatchMedia(e.matches);
        fn(e);
      });
    },
    removeEventListener: () => {
      reducedMotionListeners = [];
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** jsdom's document.hidden is read-only; state it per test. */
function hidden(value: boolean) {
  Object.defineProperty(document, "hidden", { value, configurable: true });
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
  hidden(false);
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
    // Two stacked canvases so a new sample cross-fades in over the old one,
    // and the fade must FINISH before the next sample overwrites the outgoing
    // one — a fade longer than the cadence is a pop once per cycle.
    const canvases = glow?.querySelectorAll("canvas");
    expect(canvases).toHaveLength(2);
    const fadeMs = Number(
      /duration-\[(\d+)ms\]/.exec(canvases![0].className)?.[1] ?? Number.NaN,
    );
    expect(fadeMs).toBeLessThanOrEqual(SAMPLE_INTERVAL_MS);
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
    vi.advanceTimersByTime(SAMPLE_INTERVAL_MS);
    expect(drawImage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SAMPLE_INTERVAL_MS);
    expect(drawImage).toHaveBeenCalledTimes(2);

    // Pause freezes the last frame: the interval is torn down, not merely idled.
    Object.defineProperty(el, "paused", { value: true, configurable: true, writable: true });
    el.dispatchEvent(new Event("pause"));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(SAMPLE_INTERVAL_MS * 4);
    expect(drawImage).toHaveBeenCalledTimes(2);
  });

  it("stops sampling while the tab is hidden and resumes when it comes back", () => {
    vi.useFakeTimers();
    const { ref } = playingVideo();
    render(<AmbientGlow posterUrl="https://cdn.example/poster.jpg" videoRef={ref} />);

    hidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(drawImage).not.toHaveBeenCalled();

    hidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(SAMPLE_INTERVAL_MS);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("tears the sampler down on unmount — no timer outlives the watch page", () => {
    vi.useFakeTimers();
    const { ref } = playingVideo();
    const { unmount } = render(
      <AmbientGlow posterUrl="https://cdn.example/poster.jpg" videoRef={ref} />,
    );
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(drawImage).not.toHaveBeenCalled();
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

  it("stops sampling if Reduce Motion is switched on mid-playback", () => {
    vi.useFakeTimers();
    const { ref } = playingVideo();
    render(<AmbientGlow posterUrl="https://cdn.example/poster.jpg" videoRef={ref} />);
    vi.advanceTimersByTime(SAMPLE_INTERVAL_MS);
    expect(drawImage).toHaveBeenCalledTimes(1);

    // The preference is a live query, not a value read once at mount.
    act(() => {
      reducedMotionListeners.forEach((l) => l({ matches: true } as MediaQueryListEvent));
    });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });
});
