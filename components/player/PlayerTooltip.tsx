"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DOMAttributes,
  type RefObject,
} from "react";

// ONE tooltip for the whole control bar (YouTube's model), not one popup per
// button. Every control only REPORTS "the pointer/focus is on me, here is my
// label"; the bar owns the single bubble and draws it above the seek bar, so:
//   • there is exactly one absolutely-positioned node to keep inside the stage
//     (the mobile-controls e2e pins every control inside the stage box, and a
//     per-button popup would be eight more things that can escape it);
//   • the label never covers the timeline the viewer is aiming at;
//   • it costs one render per hover, not one portal per button.
//
// The bubble is deliberately NOT wired to aria-describedby: these controls are
// icon-only and already carry the whole label as their accessible name, so
// describing them with the same words again is duplicate announcement.

/** How long the pointer must rest on a control before its label appears. */
export const TIP_HOVER_DELAY_MS = 350;

export interface PlayerTipHandle {
  /** Report hover/focus on a control. `immediate` skips the hover dwell (keyboard focus). */
  show(el: HTMLElement | null, label: string, keys?: string, immediate?: boolean): void;
  /**
   * Same, but only when nothing is already armed or showing — what a bare
   * pointermove uses, so a pointer that was ALREADY parked on a control when
   * the player hydrated still gets its label without re-triggering on every
   * one of the hundreds of moves that follow.
   */
  showIfIdle(el: HTMLElement | null, label: string, keys?: string): void;
  /**
   * Re-state a control's CURRENT label. A control whose name changes while it
   * is hovered (Play → Pause on K) calls this; it is a no-op for any control
   * that is not the one being shown.
   */
  refresh(el: HTMLElement | null, label: string, keys?: string): void;
  hide(): void;
}

const PlayerTipContext = createContext<PlayerTipHandle | null>(null);

export const PlayerTipProvider = PlayerTipContext.Provider;

type TipHandlers<T extends HTMLElement> = Pick<
  DOMAttributes<T>,
  | "onPointerEnter"
  | "onPointerMove"
  | "onPointerLeave"
  | "onPointerDown"
  | "onPointerUp"
  | "onFocus"
  | "onBlur"
  | "onClick"
>;

/**
 * The handlers a player control spreads to feed the bar's tooltip, composed
 * over whatever handlers the call site already passes. Outside a player (no
 * provider) or without a label it is a pass-through, so the same components
 * still work anywhere else.
 *
 * Focus only shows the tooltip when the focus did NOT come from a pointer.
 * jsdom always answers `false` to `:focus-visible` (it has no input-modality
 * heuristic), so gating on that selector would make the keyboard path both
 * untestable and wrong under test; tracking our own pointerdown is the same
 * rule, decided locally. That flag is cleared on pointerUP and on leave, not
 * only on blur: Safari does not focus a button on click, so a pointerdown flag
 * that waited for a blur that never came suppressed every later keyboard
 * tooltip on the page.
 */
export function usePlayerTipProps<T extends HTMLElement>(
  tip: string | undefined,
  keys: string | undefined,
  own: TipHandlers<T> = {},
): TipHandlers<T> {
  const handle = useContext(PlayerTipContext);
  const pointerRef = useRef(false);
  // The element this control last reported, so a label change can be pushed to
  // an OPEN bubble without the bar having to know which control it belongs to.
  const elRef = useRef<HTMLElement | null>(null);

  // Keep an open bubble's text in step with the control under it. `refresh`
  // ignores everything that is not the shown control, and returns the SAME
  // state object when nothing changes, so React bails out of the re-render —
  // this costs a render only on the rare frame where a hovered control renames
  // itself (Play → Pause, Mute → Unmute, Fullscreen → Exit full screen).
  useEffect(() => {
    if (elRef.current) handle?.refresh(elRef.current, tip ?? "", keys);
  }, [handle, tip, keys]);

  if (!handle || !tip) return own;
  return {
    onPointerEnter: (e) => {
      elRef.current = e.currentTarget;
      handle.show(e.currentTarget, tip, keys, false);
      own.onPointerEnter?.(e);
    },
    onPointerMove: (e) => {
      // A pointer already resting on the control when the player hydrates never
      // fires another `pointerenter` — React attaches its listener after the
      // native event has been and gone. Without this the label simply never
      // appears (and the e2e that hovered before hydration was flaky for the
      // same reason).
      elRef.current = e.currentTarget;
      handle.showIfIdle(e.currentTarget, tip, keys);
      own.onPointerMove?.(e);
    },
    onPointerLeave: (e) => {
      pointerRef.current = false;
      elRef.current = null;
      handle.hide();
      own.onPointerLeave?.(e);
    },
    onPointerDown: (e) => {
      pointerRef.current = true;
      own.onPointerDown?.(e);
    },
    onPointerUp: (e) => {
      pointerRef.current = false;
      own.onPointerUp?.(e);
    },
    onFocus: (e) => {
      if (!pointerRef.current) {
        elRef.current = e.currentTarget;
        handle.show(e.currentTarget, tip, keys, true);
      }
      own.onFocus?.(e);
    },
    onBlur: (e) => {
      pointerRef.current = false;
      handle.hide();
      own.onBlur?.(e);
    },
    onClick: (e) => {
      handle.hide();
      own.onClick?.(e);
    },
  };
}

interface ActiveTip {
  label: string;
  keys?: string;
  /** Centre of the reporting control, in the ANCHOR ROW's coordinates. */
  center: number;
}

/**
 * The bar-side half: the handle controls hand to `usePlayerTipProps`, the
 * state, and the ref for the zero-height anchor row the bubble is positioned
 * against.
 *
 * The anchor row — not the bar — is the frame for BOTH the centre and the
 * clamp, and that is the whole point of it existing. The bar carries
 * `px-1.5 sm:px-3`, so a centre measured from the bar's border box and applied
 * inside its padding box lands one padding-width to the right (+12px at a
 * desktop stage), and a clamp computed against the bar's full width lets the
 * rightmost control's bubble hang past the stage's `overflow-hidden` edge.
 */
export function usePlayerTooltip() {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<ActiveTip | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  // True from the moment a dwell is armed until the bubble is dismissed — what
  // `showIfIdle` tests, so a stream of pointermoves cannot re-arm the timer.
  const activeRef = useRef(false);
  const activeElRef = useRef<HTMLElement | null>(null);

  const hide = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    activeRef.current = false;
    activeElRef.current = null;
    setTip(null);
  }, []);

  const show = useCallback<PlayerTipHandle["show"]>((el, label, keys, immediate) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    // Touch has no hover: a tap would flash the label and leave it stranded
    // under the finger. Keyboard focus still shows it.
    if (!immediate && window.matchMedia?.("(hover: none)").matches) return;
    activeRef.current = true;
    activeElRef.current = el;
    const place = () => {
      const anchorBox = anchor.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      setTip({ label, keys, center: box.left + box.width / 2 - anchorBox.left });
    };
    if (immediate) place();
    else timerRef.current = window.setTimeout(place, TIP_HOVER_DELAY_MS);
  }, []);

  const showIfIdle = useCallback<PlayerTipHandle["showIfIdle"]>(
    (el, label, keys) => {
      if (activeRef.current) return;
      show(el, label, keys, false);
    },
    [show],
  );

  const refresh = useCallback<PlayerTipHandle["refresh"]>((el, label, keys) => {
    if (!el || activeElRef.current !== el) return;
    setTip((current) =>
      current === null || (current.label === label && current.keys === keys)
        ? current
        : { ...current, label, keys },
    );
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // A bubble must not outlive the surface it was drawn over. Entering or
  // leaving fullscreen re-lays-out the stage under a pointer that never moves
  // (so no pointerleave ever arrives), and a tab switch leaves it parked on
  // return; both stranded it.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const dismiss = () => hide();
    document.addEventListener("fullscreenchange", dismiss);
    document.addEventListener("visibilitychange", dismiss);
    return () => {
      document.removeEventListener("fullscreenchange", dismiss);
      document.removeEventListener("visibilitychange", dismiss);
    };
  }, [hide]);

  const handle = useMemo<PlayerTipHandle>(
    () => ({ show, showIfIdle, refresh, hide }),
    [show, showIfIdle, refresh, hide],
  );
  return { handle, tip, anchorRef, hideTip: hide };
}

/**
 * The bubble itself — a zero-height anchor row that sits directly above the
 * seek bar inside the control bar's flex column, so the label clears the whole
 * transport (timeline included) and is clamped to the bar's CONTENT width.
 */
export function PlayerTooltipLayer({
  tip,
  anchorRef,
}: {
  tip: ActiveTip | null;
  anchorRef: RefObject<HTMLDivElement | null>;
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // Clamp inside the anchor row once the bubble has a measured width. The
  // render below positions it on the control's centre; this correction writes
  // the clamped left straight to the node (an external system — no setState, no
  // cascading render) in a LAYOUT effect, so it lands before paint and never
  // slides. jsdom has no layout, so every rect is 0 there and the bubble stays
  // put: the clamp is exercised in the browser specs.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    const anchor = anchorRef.current;
    if (!tip || !bubble || !anchor) return;
    const width = bubble.getBoundingClientRect().width;
    const rowWidth = anchor.getBoundingClientRect().width;
    const half = width / 2;
    bubble.style.left = `${
      rowWidth > width ? Math.min(Math.max(tip.center, half), rowWidth - half) : rowWidth / 2
    }px`;
  }, [tip, anchorRef]);

  return (
    <div ref={anchorRef} className="pointer-events-none relative -mb-0.5 h-0">
      {tip ? (
        <div
          ref={bubbleRef}
          role="tooltip"
          aria-hidden="true"
          data-testid="player-tooltip"
          style={{ left: tip.center }}
          className="absolute bottom-1.5 z-30 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-md bg-black/85 px-2.5 py-1.5 text-[12px] font-medium text-white shadow-lg backdrop-blur-sm"
        >
          <span>{tip.label}</span>
          {tip.keys ? (
            <kbd className="rounded border border-white/40 px-1 pb-px text-[11px] font-medium leading-[1.35] text-white/80">
              {tip.keys}
            </kbd>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
