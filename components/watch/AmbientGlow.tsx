"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/cn";

// AmbientGlow renders the Watch page's signature ambient halo: a blurred,
// saturated wash of the video's own colour that surrounds the player, modelled
// on YouTube's #cinematics. Purely decorative (aria-hidden), never focusable,
// never a second media fetch — the poster layer reuses the image the player
// already loads, and the live layer samples frames out of the <video> that is
// already playing.
//
// WHY THE REWRITE (owner report, 2026-09-15). The first version wrapped the
// blur in `absolute inset-x-0 -inset-y-6 overflow-hidden`, so the blur was
// CLIPPED by its own box: the result was a hard-edged grey rectangle, a band
// above and below the player cut flush with its left and right edges. A glow
// with edges is not a glow. Two things fix that and both are required:
//
//   1. The layer BLEEDS past the stage (see AmbientGlow.geometry below) instead
//      of being clipped to it, and carries no overflow of its own.
//   2. `.ambient-glow` / `.ambient-glow-wash` (app/globals.css) ramp every edge
//      to fully transparent before the box, so there is no box left to see.
//
// The sideways bleed is why `#main-content` in app/layout.tsx carries
// `overflow-x-clip`: the page must still never scroll horizontally
// (e2e/responsive.spec.ts). `clip` and not `hidden` — `hidden` would make that
// column a scroll container and break sticky descendants and focus scrolling.

/** Sample bitmap size — colour only; it is blurred to 40px, detail is waste. */
const SAMPLE_W = 48;
const SAMPLE_H = 27;

/**
 * Sampling cadence. YouTube recomputes its ambient colour every ~5s and
 * cross-fades; 1s with a 1.5s cross-fade keeps the wash reactive without ever
 * reading as flicker. Deliberately NOT requestAnimationFrame: this is ambience,
 * not animation, and a per-frame canvas draw behind a 40px blur is pure heat.
 */
const SAMPLE_INTERVAL_MS = 1000;

type GlowProps = {
  posterUrl: string | null;
  /**
   * The playing <video>, shared with VideoPlayer. Optional: without it the halo
   * is the static poster wash (which is also all that reduced-motion gets).
   */
  videoRef?: RefObject<HTMLVideoElement | null>;
};

export function AmbientGlow({ posterUrl, videoRef }: GlowProps) {
  const canvasA = useRef<HTMLCanvasElement | null>(null);
  const canvasB = useRef<HTMLCanvasElement | null>(null);
  // Which canvas is on top. The other one is the one we draw into next, so a
  // fresh sample always fades IN over the frame it replaces.
  const [front, setFront] = useState<"a" | "b">("a");
  // The sampler owns this ref (never written during render); `front` only
  // mirrors it into the DOM so React paints the cross-fade.
  const frontRef = useRef<"a" | "b">("a");
  // Resolved after mount: whether there is a <video> to light up at all, and
  // whether the visitor asked for less motion. Both start false so the server
  // render and the first client render agree (no hydration mismatch).
  const [hasVideo, setHasVideo] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setHasVideo(!!videoRef?.current);
    setReducedMotion(
      typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, [videoRef, posterUrl]);

  useEffect(() => {
    const video = videoRef?.current;
    // Reduced motion gets the static poster wash — a slowly shifting colour
    // field is exactly the kind of ambient motion that preference turns off.
    if (!video || reducedMotion) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    // Arrow functions, not declarations: a hoisted `function` defeats the
    // narrowing of `video` to non-null established by the guard above.
    const sample = () => {
      // Nothing to light while the player owns the whole screen, and nothing to
      // look at in a background tab — in both cases skip the draw entirely.
      if (document.hidden || document.fullscreenElement) return;
      if (video.paused || video.ended) return;
      // HAVE_CURRENT_DATA: below this some browsers throw on drawImage.
      if (video.readyState < 2) return;
      const next = frontRef.current === "a" ? "b" : "a";
      const target = (next === "a" ? canvasA : canvasB).current;
      const ctx = target?.getContext("2d");
      if (!ctx) return;
      try {
        // Drawing a cross-origin video TAINTS this canvas. That is fine — it
        // still paints. Never read it back (getImageData/toDataURL would throw).
        ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      } catch {
        // A frame that is not decodable yet: keep the previous wash.
        return;
      }
      frontRef.current = next;
      setFront(next);
    };

    const start = () => {
      if (timer === null) timer = setInterval(sample, SAMPLE_INTERVAL_MS);
    };
    /** Pause/end/hide freezes the last frame: tear the timer down, keep the pixels. */
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!video.paused && !video.ended) start();
    };

    if (!video.paused && !video.ended) start();
    video.addEventListener("play", start);
    video.addEventListener("playing", start);
    video.addEventListener("pause", stop);
    video.addEventListener("ended", stop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      video.removeEventListener("play", start);
      video.removeEventListener("playing", start);
      video.removeEventListener("pause", stop);
      video.removeEventListener("ended", stop);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [videoRef, reducedMotion, hasVideo]);

  // No poster and no video: there is no imagery to bloom from, so paint nothing
  // rather than a grey smudge.
  if (!posterUrl && !hasVideo) return null;

  return (
    <div
      aria-hidden
      data-testid="ambient-glow"
      className={cn(
        // AmbientGlow.geometry — the bleed. Percentages resolve against the
        // stage (the `relative isolate` wrapper in WatchView), so the halo
        // scales with the player at every breakpoint and in theater mode.
        // ~9% sideways and ~22% above/below echoes YouTube's scale(1.5, 2):
        // more bleed vertically than horizontally, because that is where the
        // page has room and where the eye reads "light spilling off the screen".
        "pointer-events-none absolute -bottom-[22%] -left-[9%] -right-[9%] -top-[22%] -z-10",
        // Horizontal edge falloff + the per-theme opacity (app/globals.css).
        "ambient-glow",
      )}
    >
      {/*
        The wash. A SECOND element because the two axes of the falloff are two
        masks, and nesting is how they intersect without `mask-composite` (see
        the note in app/globals.css — the composite fallback is the old bug).
        It owns the blur and the saturation.
      */}
      <div className="ambient-glow-wash absolute inset-0">
        {posterUrl ? (
          <div
            data-testid="ambient-glow-poster"
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${posterUrl}")` }}
          />
        ) : null}
        {/*
          Two stacked sample canvases. The incoming one sits on top at opacity 1
          and the outgoing one stays below at 0, so a colour change takes 1.5s to
          complete — slow enough to read as ambience rather than a cut.
        */}
        <canvas
          ref={canvasA}
          width={SAMPLE_W}
          height={SAMPLE_H}
          className="absolute inset-0 h-full w-full transition-opacity duration-[1500ms] ease-linear"
          style={{ opacity: front === "a" ? 1 : 0, zIndex: front === "a" ? 1 : 0 }}
        />
        <canvas
          ref={canvasB}
          width={SAMPLE_W}
          height={SAMPLE_H}
          className="absolute inset-0 h-full w-full transition-opacity duration-[1500ms] ease-linear"
          style={{ opacity: front === "b" ? 1 : 0, zIndex: front === "b" ? 1 : 0 }}
        />
      </div>
    </div>
  );
}
