// Pure keyboard-shortcut mapping for the watch-page player (unit-tested; the
// DOM wiring lives in WatchView). The shortcut set mirrors the accessible help
// panel (KeyboardShortcutsHelp) — keep the two in sync.

export type PlayerShortcut =
  | { kind: "toggle-play" }
  | { kind: "seek-by"; seconds: number }
  | { kind: "toggle-mute" }
  | { kind: "toggle-fullscreen" }
  | { kind: "toggle-captions" };

/**
 * shortcutForKey maps a keydown to a player action: space/K play-pause,
 * J/L ±10s, arrows ±5s, M mute, F fullscreen, C captions. Modified presses
 * (ctrl/meta/alt) are never shortcuts — they belong to the browser.
 */
export function shortcutForKey(e: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): PlayerShortcut | null {
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
    case "m":
    case "M":
      return { kind: "toggle-mute" };
    case "f":
    case "F":
      return { kind: "toggle-fullscreen" };
    case "c":
    case "C":
      return { kind: "toggle-captions" };
    default:
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
 * Keydown targets that must never trigger player shortcuts: form fields and
 * other interactive controls (typing or operating them wins), plus the video
 * element itself (its focused native controls already handle these keys).
 * Content-editable hosts are handled separately in the DOM wiring.
 */
export const SHORTCUT_IGNORE_SELECTOR =
  "input, textarea, select, button, a, video, [contenteditable], [role='menu'], [role='dialog']";
