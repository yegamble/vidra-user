import type { SVGProps } from "react";

import { cn } from "@/lib/cn";

// The bespoke player's glyph set — the ONE module the design system sanctions
// for inline SVG inside `player/*` (see .ralph/specs/design-system.md,
// "Iconography"). It exists because the chrome is not the app: these glyphs sit
// on video, at 22px inside 44px round targets, and they have to read as one
// family at a glance. The app's feather-style set (components/icons) is a
// 1.8px-stroke outline vocabulary tuned for themed surfaces; mixing the two is
// exactly what made the old bar look like a stock <video> — outline speaker and
// outline captions next to a solid play triangle.
//
// House style, deliberately narrow so nothing drifts:
//   • 24-unit viewBox, rendered at 22px by default (`size`), `aria-hidden`.
//   • SOLID, SF-Symbols-like forms (`play.fill`, `speaker.wave.2.fill`,
//     `captions.bubble.fill`, `pip.fill`). Where a shape is a frame (theater,
//     PiP), it is a FILLED path with an evenodd hole — not a thin stroke — so
//     the optical weight matches the solid glyphs beside it.
//   • `fill="currentColor"`; the button owns the colour (white/90 at rest).
//   • Any stroke used for a round-capped arc (the speaker waves, the replay
//     ring, the gauge) is 2.4–2.6 wide, which matches the mass of the solids.
//
// Add a glyph here rather than inlining one at a call site: the bar's coherence
// is a property of the set, not of any single button.

type GlyphProps = SVGProps<SVGSVGElement> & {
  /**
   * Rendered edge, in px (default 22 — the bar's glyph size inside a 44pt
   * target). Set as WIDTH/HEIGHT ATTRIBUTES, not utility classes, for the same
   * reason components/icons does: `cn()` here is a plain concat with no
   * tailwind-merge, so a call site's `h-3` does not reliably beat a base
   * `h-[22px]` (same-group utilities resolve by stylesheet order) — that is the
   * icon-squeeze class of bug this repo has already shipped once.
   */
  size?: number;
};

function Glyph({ size = 22, className, children, ...rest }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
      fill="currentColor"
      {...rest}
    >
      {children}
    </svg>
  );
}

/**
 * play.fill — ONE filled path, corners rounded by quadratic curves rather than
 * by a stroke. The first cut filled AND stroked the same path in
 * `currentColor`: at `text-white/90` the two alphas composite (1-0.1²≈0.99) and
 * the rim rendered a full step brighter than the body (sampled 253 vs 232) — a
 * bright outline around a dimmer triangle, which is precisely the "looks like
 * the generic player" outline look this pass exists to remove. No glyph in this
 * module paints fill and stroke over the same geometry; where a stroke appears
 * (the replay ring, the speaker waves) it is `fill="none"`.
 */
export function PlayGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M8.2 6.6Q8.2 4.6 9.9 5.66L18.14 10.83Q20 12 18.14 13.17L9.9 18.34Q8.2 19.4 8.2 17.4Z" />
    </Glyph>
  );
}

/** pause.fill — two round-cornered bars. */
export function PauseGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="6.4" y="4.4" width="4.2" height="15.2" rx="1.7" />
      <rect x="13.4" y="4.4" width="4.2" height="15.2" rx="1.7" />
    </Glyph>
  );
}

/** gobackward — a heavy ring with a gap, plus a solid arrowhead at the gap. */
export function ReplayGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path
        d="M12 4.9a7.1 7.1 0 1 0 7.1 7.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M13.1 1.9 8.9 4.32a.66.66 0 0 0 0 1.16l4.2 2.42a.67.67 0 0 0 1-.58V2.48a.67.67 0 0 0-1-.58z" />
    </Glyph>
  );
}

/** The shared solid speaker body used by all three volume states. */
const SPEAKER_BODY =
  "M11.05 4.42 6.75 8.2H4.2A1.4 1.4 0 0 0 2.8 9.6v4.8a1.4 1.4 0 0 0 1.4 1.4h2.55l4.3 3.78c.9.79 2.3.15 2.3-1.05V5.47c0-1.2-1.4-1.84-2.3-1.05z";

/** speaker.slash.fill */
export function VolumeMutedGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={SPEAKER_BODY} />
      <path
        d="M16.4 9.6 21.2 14.4M21.2 9.6 16.4 14.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </Glyph>
  );
}

/** speaker.wave.1.fill */
export function VolumeLowGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={SPEAKER_BODY} />
      <path
        d="M16.5 9.35a3.75 3.75 0 0 1 0 5.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </Glyph>
  );
}

/** speaker.wave.2.fill */
export function VolumeHighGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={SPEAKER_BODY} />
      <path
        d="M16.5 9.35a3.75 3.75 0 0 1 0 5.3M19.4 6.6a7.6 7.6 0 0 1 0 10.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </Glyph>
  );
}

/**
 * captions.bubble.fill — a rounded plate with two knocked-out caption lines
 * (evenodd), which is what makes it read as "text on a card" rather than as an
 * empty outlined box.
 *
 * Sized down from 20×14 to 18×12 and the knockouts fattened from 2.1 units to
 * 2.6 with a 2-unit gap: at 22px on a DPR-1 display the old slots were under a
 * device pixel apart and antialiased into a single dash, so the glyph read as a
 * solid slab carrying ~2.4× the ink of the play triangle beside it.
 */
export function CaptionsGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.6 6h12.8A2.6 2.6 0 0 1 21 8.6v6.8a2.6 2.6 0 0 1-2.6 2.6H5.6A2.6 2.6 0 0 1 3 15.4V8.6A2.6 2.6 0 0 1 5.6 6zm1.5 2.4a1.3 1.3 0 1 0 0 2.6h5.2a1.3 1.3 0 1 0 0-2.6H7.1zm0 4.6a1.3 1.3 0 1 0 0 2.6h9.8a1.3 1.3 0 1 0 0-2.6H7.1z"
      />
    </Glyph>
  );
}

/**
 * rectangle.inset.filled → theater OFF: the wide stage the button switches TO.
 *
 * 22×9.5 — deliberately wider AND shorter than the PiP frame (20×14) beside it.
 * Both are rings of the same 2.2-unit weight, so aspect ratio is the only thing
 * telling them apart at 22px; at the first cut's 20×12.8 they were the same
 * silhouette with a dot in one of them.
 */
export function TheaterEnterGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.2 7.25h17.6A2.2 2.2 0 0 1 23 9.45v5.1a2.2 2.2 0 0 1-2.2 2.2H3.2A2.2 2.2 0 0 1 1 14.55v-5.1a2.2 2.2 0 0 1 2.2-2.2zm.2 2.2a.4.4 0 0 0-.4.4v4.3c0 .22.18.4.4.4h17.2a.4.4 0 0 0 .4-.4v-4.3a.4.4 0 0 0-.4-.4H3.4z"
      />
    </Glyph>
  );
}

/** theater ON: the smaller, default stage the button switches BACK to. */
export function TheaterExitGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.2 7h9.6A2.2 2.2 0 0 1 19 9.2v5.6A2.2 2.2 0 0 1 16.8 17H7.2A2.2 2.2 0 0 1 5 14.8V9.2A2.2 2.2 0 0 1 7.2 7zm.2 2.4a.4.4 0 0 0-.4.4v4.4c0 .22.18.4.4.4h9.2a.4.4 0 0 0 .4-.4V9.8a.4.4 0 0 0-.4-.4H7.4z"
      />
    </Glyph>
  );
}

/** pip.fill — the frame plus the solid inset window. */
export function PipGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.4 5h15.2A2.4 2.4 0 0 1 22 7.4v9.2a2.4 2.4 0 0 1-2.4 2.4H4.4A2.4 2.4 0 0 1 2 16.6V7.4A2.4 2.4 0 0 1 4.4 5zm.2 2.4a.4.4 0 0 0-.4.4v8.4c0 .22.18.4.4.4h14.8a.4.4 0 0 0 .4-.4V7.8a.4.4 0 0 0-.4-.4H4.6z"
      />
      <rect x="11.3" y="10.5" width="7.5" height="5.3" rx="1.2" />
    </Glyph>
  );
}

// Fullscreen is SF's `arrow.up.left.and.arrow.down.right` idea drawn as four
// solid corner brackets (two round-cornered bars each) — the only shape in the
// set that has no mass of its own, so the bars are the same 2.6 weight as the
// strokes elsewhere.
const ARM = 7.2;
const THICK = 2.6;
const R = 1.3;

/** Corners pushed OUT — the control that takes the player fullscreen. */
export function FullscreenEnterGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="3" width={ARM} height={THICK} rx={R} />
      <rect x="3" y="3" width={THICK} height={ARM} rx={R} />
      <rect x="13.8" y="3" width={ARM} height={THICK} rx={R} />
      <rect x="18.4" y="3" width={THICK} height={ARM} rx={R} />
      <rect x="3" y="18.4" width={ARM} height={THICK} rx={R} />
      <rect x="3" y="13.8" width={THICK} height={ARM} rx={R} />
      <rect x="13.8" y="18.4" width={ARM} height={THICK} rx={R} />
      <rect x="18.4" y="13.8" width={THICK} height={ARM} rx={R} />
    </Glyph>
  );
}

/** Corners pulled IN — the control that leaves fullscreen. */
export function FullscreenExitGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="4.3" y="8.9" width={ARM} height={THICK} rx={R} />
      <rect x="8.9" y="4.3" width={THICK} height={ARM} rx={R} />
      <rect x="12.5" y="8.9" width={ARM} height={THICK} rx={R} />
      <rect x="12.5" y="4.3" width={THICK} height={ARM} rx={R} />
      <rect x="4.3" y="12.5" width={ARM} height={THICK} rx={R} />
      <rect x="8.9" y="12.5" width={THICK} height={ARM} rx={R} />
      <rect x="12.5" y="12.5" width={ARM} height={THICK} rx={R} />
      <rect x="12.5" y="12.5" width={THICK} height={ARM} rx={R} />
    </Glyph>
  );
}

/** ellipsis.vertical — the bar's overflow trigger. */
export function OverflowGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="5.5" r="1.95" />
      <circle cx="12" cy="12" r="1.95" />
      <circle cx="12" cy="18.5" r="1.95" />
    </Glyph>
  );
}
