// Pure keyboard-shortcut mapping for the watch-page player (unit-tested; the
// DOM wiring lives in the VideoPlayer shell). The shortcut set mirrors the
// accessible help panel (KeyboardShortcutsHelp) — keep the two in sync.

export type PlayerShortcut =
  | { kind: "toggle-play" }
  | { kind: "seek-by"; seconds: number }
  | { kind: "seek-to-fraction"; fraction: number }
  | { kind: "frame-step"; seconds: number }
  | { kind: "volume-by"; deltaPercent: number }
  | { kind: "speed-step"; direction: number }
  | { kind: "toggle-mute" }
  | { kind: "toggle-fullscreen" }
  | { kind: "toggle-captions" }
  | { kind: "toggle-theater" }
  | { kind: "toggle-pip" };

/** One video frame at ~30fps — the `,`/`.` frame-step granularity (PLAY-09). */
export const FRAME_STEP_SECONDS = 1 / 30;

/**
 * Context the mapping needs beyond the raw key: whether the player region holds
 * focus (scopes the volume arrows — see below) and whether the media is paused
 * (gates frame-stepping). Both default to false, so the standalone mappings a
 * unit test exercises without a context still resolve.
 */
export interface ShortcutContext {
  /**
   * True when focus is within the player region. Volume ArrowUp/Down only act
   * while the player is focused — otherwise the arrows scroll the page (the
   * seek arrows keep their global-ish behaviour; only the volume pair is
   * scoped, per PLAY-09).
   */
  playerFocused?: boolean;
  /** True when the media element is paused — gates `,`/`.` frame-stepping. */
  paused?: boolean;
}

/**
 * shortcutForKey maps a keydown to a player action. The full PLAY-09 set:
 * space/K play-pause, J/L ±10s, ←/→ ±5s, ↑/↓ volume ±5% (player-focused only),
 * 0–9 decile seek, Home/End to the ends, `<`/`>` speed-ladder step, `,`/`.`
 * frame-step while paused, M mute, C captions, T theater, I picture-in-picture,
 * F fullscreen. `<`/`>` (and `?`) are Shift-produced glyphs, so Shift is a
 * legitimate modifier here; Ctrl/Meta/Alt presses are never shortcuts — they
 * belong to the browser.
 */
export function shortcutForKey(
  e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  ctx: ShortcutContext = {},
): PlayerShortcut | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case " ":
    case "k":
    case "K":
      return { kind: "toggle-play" };
    case "j":
    case "J":
      return { kind: "seek-by", seconds: -10 };
    case "l":
    case "L":
      return { kind: "seek-by", seconds: 10 };
    case "ArrowLeft":
      return { kind: "seek-by", seconds: -5 };
    case "ArrowRight":
      return { kind: "seek-by", seconds: 5 };
    case "ArrowUp":
      // Volume is scoped to the player region so the page can still scroll.
      return ctx.playerFocused ? { kind: "volume-by", deltaPercent: 5 } : null;
    case "ArrowDown":
      return ctx.playerFocused ? { kind: "volume-by", deltaPercent: -5 } : null;
    case "Home":
      return { kind: "seek-to-fraction", fraction: 0 };
    case "End":
      return { kind: "seek-to-fraction", fraction: 1 };
    case "<":
      return { kind: "speed-step", direction: -1 };
    case ">":
      return { kind: "speed-step", direction: 1 };
    case ",":
      // Frame-stepping only makes sense (and only acts) while paused.
      return ctx.paused ? { kind: "frame-step", seconds: -FRAME_STEP_SECONDS } : null;
    case ".":
      return ctx.paused ? { kind: "frame-step", seconds: FRAME_STEP_SECONDS } : null;
    case "m":
    case "M":
      return { kind: "toggle-mute" };
    case "f":
    case "F":
      return { kind: "toggle-fullscreen" };
    case "c":
    case "C":
      return { kind: "toggle-captions" };
    case "t":
    case "T":
      return { kind: "toggle-theater" };
    case "i":
    case "I":
      return { kind: "toggle-pip" };
    default:
      // Number keys 0–9 jump to that decile of the timeline (5 → 50%).
      if (e.key.length === 1 && e.key >= "0" && e.key <= "9") {
        return { kind: "seek-to-fraction", fraction: Number(e.key) / 10 };
      }
      return null;
  }
}

/**
 * clampSeekTarget clamps a relative seek to [0, duration]. An unknown duration
 * (NaN/Infinity before metadata) only clamps the lower bound — the element
 * ignores overshoot on its own.
 */
export function clampSeekTarget(current: number, delta: number, duration: number): number {
  const target = Math.max(0, current + delta);
  return Number.isFinite(duration) && duration > 0 ? Math.min(target, duration) : target;
}

/**
 * seekTargetForFraction maps a 0..1 timeline fraction (a decile key, Home, or
 * End) to an absolute time in [0, duration]. An unknown duration yields null —
 * the caller leaves currentTime untouched until metadata is known.
 */
export function seekTargetForFraction(fraction: number, duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const clampedFraction = Math.min(Math.max(fraction, 0), 1);
  return clampedFraction * duration;
}

/**
 * Keydown targets that must never trigger player shortcuts: form fields and
 * other interactive controls (typing or operating them wins), plus the video
 * element itself (its focused native controls already handle these keys).
 * Content-editable hosts are handled separately in the DOM wiring.
 */
export const SHORTCUT_IGNORE_SELECTOR =
  "input, textarea, select, button, a, video, [contenteditable], [role='menu'], [role='dialog']";
