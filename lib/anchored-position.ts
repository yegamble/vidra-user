// Pure placement geometry for portaled menus (the Wave D "portal + fixed"
// pattern in .ralph/specs/design-system.md). A menu portaled to the body — or,
// while the page is fullscreen, into the fullscreen element — is positioned
// `fixed` from its trigger's rect, flipped to whichever side has room and
// clamped inside the viewport, so no scroll container or `overflow-hidden`
// ancestor can ever clip it.
//
// This lives apart from any component because it is the SHARED authority for
// two very different menus: ui/Dropdown (themed surfaces, opens downward) and
// PlayerMenu (media overlay, opens upward out of the player's control bar).
// Keeping one implementation is what stops the two drifting; keeping it pure
// is what makes the flip/clamp cases unit-testable without a browser.

/** The parts of a DOMRect placement needs. */
export interface AnchorRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AnchoredPositionOptions {
  /** Align the menu's start or end edge with the trigger's. Default "start". */
  align?: "start" | "end";
  /** Viewport edge keep-out. Default 8. */
  margin?: number;
  /** Gap between trigger and menu. Default 4. */
  gap?: number;
  /**
   * Which side to try FIRST. Default "below" (a normal dropdown). The player's
   * control bar sits on the bottom edge of the video, so its menus pass
   * "above" — otherwise every one of them would open off the bottom of the
   * screen and then be clamped back over the bar it belongs to.
   */
  prefer?: "below" | "above";
}

function clamp(n: number, min: number, max: number): number {
  // max < min when the menu is taller/wider than the viewport allows: pin to
  // min (top/left edge) and let the menu's own max-height scroll the overflow,
  // rather than pushing its first row off-screen.
  return Math.max(min, Math.min(n, max));
}

/**
 * anchoredPosition returns the `fixed` top/left for a menu of size `menu`
 * opened from `trigger`, flipped and clamped to `viewport`.
 */
export function anchoredPosition(
  trigger: AnchorRect,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  options: AnchoredPositionOptions = {},
): { top: number; left: number } {
  const { align = "start", margin = 8, gap = 4, prefer = "below" } = options;

  const spaceBelow = viewport.height - trigger.bottom - margin;
  const spaceAbove = trigger.top - margin;
  // Flip only when the preferred side cannot hold the menu AND the other side
  // has strictly more room — so a menu that fits stays where the caller asked.
  const up =
    prefer === "above"
      ? !(spaceAbove < menu.height && spaceBelow > spaceAbove)
      : spaceBelow < menu.height && spaceAbove > spaceBelow;

  let end = align === "end";
  if (end && trigger.right - menu.width < margin && trigger.left + menu.width <= viewport.width - margin) {
    end = false;
  } else if (
    !end &&
    trigger.left + menu.width > viewport.width - margin &&
    trigger.right - menu.width >= margin
  ) {
    end = true;
  }

  const rawTop = up ? trigger.top - menu.height - gap : trigger.bottom + gap;
  const rawLeft = end ? trigger.right - menu.width : trigger.left;

  return {
    top: clamp(rawTop, margin, viewport.height - menu.height - margin),
    left: clamp(rawLeft, margin, viewport.width - menu.width - margin),
  };
}
