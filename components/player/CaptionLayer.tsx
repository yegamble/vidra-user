"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// The app-rendered caption surface.
//
// WHY THIS EXISTS AT ALL: a browser draws a `showing` text track at the bottom
// of the VIDEO element, and it knows nothing about the chrome we overlay on top
// of it — so the cue sat BEHIND the control bar, its text crossing the
// play/volume/time row. Nothing in the app can move a native cue relative to our
// bar (`::cue` reaches the font and the box, never the position, and it cannot
// be transitioned), so the only fix is to stop asking the browser to draw them:
// the selected track runs in `hidden` mode — still parsed, still firing
// `cuechange`, just not painted — and this layer paints the active cues itself,
// inside the stage, where it can be positioned against the bar we measure.
//
// The one surface it cannot follow is picture-in-picture: the PiP window is the
// browser's, not ours. VideoPlayer flips the track back to `showing` on the way
// in (and to `hidden` on the way out), and this layer draws nothing while the
// mode is not `hidden` — so exactly one of the two renderers is ever live.
//
// Placement follows Apple TV rather than YouTube (per-line black bars) or
// Netflix (bare drop-shadowed text): one rounded translucent box around the
// whole cue, white text, held in the title-safe band while the UI is idle and
// lifted above the transport when the UI is up, on the chrome's own motion.

/** Title-safe band when the chrome is idle: a share of the stage height... */
const SAFE_RATIO = 0.06;
/** ...floored, so a phone-sized stage still keeps the box off the bottom edge. */
const SAFE_MIN_PX = 24;
/** Clear air between the caption box and the top of the control row. */
const CONTROLS_GAP_PX = 14;

export function CaptionLayer({
  videoRef,
  stageRef,
  controlsRef,
  trackCount,
  controlsVisible,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The player stage — captions are positioned inside it, so they follow theater and fullscreen. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** The overlay control bar, measured (never hardcoded — it retiers by container query). */
  controlsRef: RefObject<HTMLDivElement | null>;
  /** Number of `<track>` elements rendered, so the subscription re-runs when they change. */
  trackCount: number;
  controlsVisible: boolean;
}) {
  const [cues, setCues] = useState<TextTrackCue[]>([]);
  const [stageHeight, setStageHeight] = useState(0);
  const [barHeight, setBarHeight] = useState(0);

  // Follow the selected track's active cues. "Selected" is any track the shell
  // left out of `disabled`; we only DRAW while it is `hidden`, which is the
  // mode that means "this layer owns the rendering" (in PiP the shell puts it
  // back to `showing` and the browser draws it in its own window instead).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const list = el.textTracks;
    if (!list) return;
    let current: TextTrack | null = null;

    const readCues = () => {
      if (!current || current.mode !== "hidden") {
        setCues((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      const active = current.activeCues;
      setCues(active ? Array.from(active) : []);
    };

    // A mode change (the captions toggle, the C shortcut, the PiP hand-back)
    // fires `change` on the LIST, not on the track, so the re-subscribe hangs
    // off the list and re-reads which track — if any — we are now drawing.
    const resubscribe = () => {
      const next = Array.from(list).find((t) => t.mode !== "disabled") ?? null;
      if (next !== current) {
        current?.removeEventListener?.("cuechange", readCues);
        current = next;
        current?.addEventListener?.("cuechange", readCues);
      }
      readCues();
    };

    resubscribe();
    // TextTrackList is an EventTarget in browsers; some test DOMs omit the
    // listener methods, so guard before wiring the live sync (same shape the
    // shell's caption-state sync uses).
    const wired = typeof list.addEventListener === "function";
    if (wired) {
      list.addEventListener("change", resubscribe);
      list.addEventListener("addtrack", resubscribe);
      list.addEventListener("removetrack", resubscribe);
    }
    return () => {
      current?.removeEventListener?.("cuechange", readCues);
      if (wired) {
        list.removeEventListener("change", resubscribe);
        list.removeEventListener("addtrack", resubscribe);
        list.removeEventListener("removetrack", resubscribe);
      }
    };
  }, [videoRef, trackCount]);

  // Measure the stage and the control bar. The bar is MEASURED, never assumed:
  // it retiers on container queries (mute, speed, quality, theater and PiP all
  // join it at different stage widths), so any hardcoded height would be wrong
  // at some width. Its border box includes the gradient scrim it paints through
  // its top padding — the scrim is not the bar, so the padding comes off and the
  // captions clear the CONTROLS, not the wash.
  useEffect(() => {
    const stage = stageRef.current;
    const bar = controlsRef.current;
    if (!stage || !bar) return;
    const measure = () => {
      setStageHeight(stage.getBoundingClientRect().height);
      const rect = bar.getBoundingClientRect();
      const padTop = Number.parseFloat(getComputedStyle(bar).paddingTop);
      setBarHeight(Math.max(0, rect.height - (Number.isFinite(padTop) ? padTop : 0)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [stageRef, controlsRef, trackCount]);

  if (trackCount === 0) return null;

  const idleInset = Math.max(stageHeight * SAFE_RATIO, SAFE_MIN_PX);
  // With the chrome up the box clears the control row; the idle band is the
  // floor, so a short bar never drags the captions BELOW the title-safe inset.
  const inset = controlsVisible ? Math.max(barHeight + CONTROLS_GAP_PX, idleInset) : idleInset;

  return (
    <div
      data-testid="player-captions"
      data-controls={controlsVisible ? "visible" : "hidden"}
      // Native cues are not exposed to assistive tech either, and the caption
      // toggle is the accessible control — this layer is decoration over it.
      aria-hidden="true"
      style={{ bottom: `${Math.round(inset)}px` }}
      // z-10: under the control bar (z-20) by construction, so even a mid-flight
      // frame cannot paint caption text over the transport. `transition-[bottom]`
      // carries no duration/easing of its own on purpose — it inherits exactly
      // the tokens the bar's `transition-opacity` uses, so the lift and the fade
      // are one movement, started in the same frame by the same state change.
      // Reduced motion is handled globally in app/globals.css (every transition
      // duration is neutralized), so there is nothing to branch on here.
      className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-1 px-[10%] text-center transition-[bottom]"
    >
      {cues.map((cue, i) => (
        <CueBox key={`${cue.startTime}-${cue.endTime}-${i}`} cue={cue} />
      ))}
    </div>
  );
}

// One cue, one box. The content comes from the browser's own parse of the VTT
// (`getCueAsHTML()` hands back a DocumentFragment of <b>/<i>/<v> nodes), which
// is why it is appended rather than rendered: raw cue text must never reach
// dangerouslySetInnerHTML — a caption file is remote, operator-uploaded input.
// Where the DOM has no getCueAsHTML the text is set as textContent, which parses
// no markup at all.
function CueBox({ cue }: { cue: TextTrackCue }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const asHtml = (cue as Partial<VTTCue>).getCueAsHTML;
    if (typeof asHtml === "function") {
      el.replaceChildren(asHtml.call(cue));
      return;
    }
    el.textContent = (cue as Partial<VTTCue>).text ?? "";
  }, [cue]);
  return (
    <div
      ref={ref}
      data-testid="player-caption-cue"
      // Apple TV's caption block: one rounded translucent slab, white text, no
      // text-shadow (the box does the contrast work). The size tracks the
      // STAGE, not the viewport — cqw against the player's own container query,
      // because the real desktop stage is ~624px wide, and cqh is unavailable
      // under the stage's inline-size containment.
      className="max-w-full text-balance rounded-lg bg-[rgb(0_0_0/0.72)] px-[0.6em] py-[0.25em] text-[clamp(14px,1.6cqw,28px)] font-medium leading-[1.3] text-white backdrop-blur-[8px]"
    />
  );
}
