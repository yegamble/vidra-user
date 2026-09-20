"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

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
// That clip is itself an edge, so the bleed is capped at the width of the
// gutter between the stage and the clip line (see AmbientGlow.geometry): a wash
// still visible where the clip lands is the same hard seam, moved 24px left.

/** Sample bitmap size — colour only; it is blurred to 40px, detail is waste. */
const SAMPLE_W = 48;
const SAMPLE_H = 27;

/**
 * Sampling cadence, and it is BOUNDED BELOW BY THE CROSS-FADE (1500ms). A
 * cadence shorter than the fade means the outgoing canvas is overwritten while
 * still ~a third visible — a pop once per cycle, and a blurred layer that
 * re-rasterizes every frame for the whole session instead of settling between
 * samples. 2500ms leaves a full second of stillness and sits nearer YouTube's
 * own calm ~5s recompute. Deliberately NOT requestAnimationFrame: this is
 * ambience, not animation, and a per-frame canvas draw behind a 40px blur is
 * pure heat. Exported so the test can assert fade <= cadence rather than
 * restate two numbers that must agree.
 */
export const SAMPLE_INTERVAL_MS = 2500;

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
  // A LIVE query, not a value read once: switching Reduce Motion on mid-session
  // must stop the sampler, the way the CSS reset stops every transition.
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setHasVideo(!!videoRef?.current);
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
      // The fullscreen check is best-effort: iOS Safari's NATIVE video
      // fullscreen sets neither `fullscreenElement` nor `webkitFullscreenElement`,
      // so there the sampler keeps drawing into a layer nobody can see. Wasteful
      // for the length of one fullscreen session, never wrong on screen.
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
    // `hasVideo` is not read in here, and is a dependency on purpose: it flips
    // false -> true on the mount pass that discovers videoRef.current, and that
    // flip is the only signal this effect gets that there is now an element to
    // attach to. Dropping it leaves the sampler permanently unattached whenever
    // the glow's first render happened before the player's ref was set.
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
        // Vertically ~22%, echoing YouTube's scale(1.5, 2): more bleed above
        // and below than sideways, because that is where the page has room and
        // where the eye reads "light spilling off the screen".
        //
        // Sideways is `min(6%, 1.5rem)` and the cap is the load-bearing half.
        // 1.5rem is the `sm:px-6` gutter between the stage and `#main-content`'s
        // clip edge, so the layer can never extend past the clip — and since the
        // mask is 0 at the layer's own edge, the clip lands on nothing. A bare
        // 6% overshoots that gutter by ~13px at a 1280 viewport and re-creates
        // the hard vertical seam this whole change exists to remove.
        "pointer-events-none absolute -z-10",
        "-bottom-[22%] -top-[22%] -left-[min(6%,1.5rem)] -right-[min(6%,1.5rem)]",
        // Below md the stage is full-bleed: there is no gutter to glow into and
        // no room beside the player, so the layer would be all cost (a canvas,
        // an interval, a blurred composite) for something nobody can see.
        "hidden md:block",
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
          complete — slow enough to read as ambience rather than a cut, and
          SHORTER than SAMPLE_INTERVAL_MS so it always finishes before the
          outgoing canvas is redrawn under it.
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
