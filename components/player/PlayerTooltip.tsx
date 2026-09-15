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
  hide(): void;
}

const PlayerTipContext = createContext<PlayerTipHandle | null>(null);

export const PlayerTipProvider = PlayerTipContext.Provider;

type TipHandlers<T extends HTMLElement> = Pick<
  DOMAttributes<T>,
  "onPointerEnter" | "onPointerLeave" | "onPointerDown" | "onFocus" | "onBlur" | "onClick"
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
 * rule, decided locally.
 */
export function usePlayerTipProps<T extends HTMLElement>(
  tip: string | undefined,
  keys: string | undefined,
  own: TipHandlers<T> = {},
): TipHandlers<T> {
  const handle = useContext(PlayerTipContext);
  const pointerRef = useRef(false);
  if (!handle || !tip) return own;
  return {
    onPointerEnter: (e) => {
      handle.show(e.currentTarget, tip, keys, false);
      own.onPointerEnter?.(e);
    },
    onPointerLeave: (e) => {
      handle.hide();
      own.onPointerLeave?.(e);
    },
    onPointerDown: (e) => {
      pointerRef.current = true;
      own.onPointerDown?.(e);
    },
    onFocus: (e) => {
      if (!pointerRef.current) handle.show(e.currentTarget, tip, keys, true);
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
  /** Centre of the reporting control, in the bar's own coordinates. */
  center: number;
}

/** The bar-side half: the handle controls hand to `usePlayerTipProps`, plus state. */
export function usePlayerTooltip(barRef: RefObject<HTMLElement | null>) {
  const [tip, setTip] = useState<ActiveTip | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const hide = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setTip(null);
  }, []);

  const show = useCallback<PlayerTipHandle["show"]>(
    (el, label, keys, immediate) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const bar = barRef.current;
      if (!el || !bar) return;
      // Touch has no hover: a tap would flash the label and leave it stranded
      // under the finger. Keyboard focus still shows it.
      if (!immediate && window.matchMedia?.("(hover: none)").matches) return;
      const place = () => {
        const barBox = bar.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        setTip({ label, keys, center: box.left + box.width / 2 - barBox.left });
      };
      if (immediate) place();
      else timerRef.current = window.setTimeout(place, TIP_HOVER_DELAY_MS);
    },
    [barRef],
  );

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handle = useMemo<PlayerTipHandle>(() => ({ show, hide }), [show, hide]);
  return { handle, tip, hideTip: hide };
}

/**
 * The bubble itself — a zero-height anchor row that sits directly above the
 * seek bar inside the control bar's flex column, so the label clears the whole
 * transport (timeline included) and is clamped to the bar's own width, which is
 * the stage's width.
 */
export function PlayerTooltipLayer({
  tip,
  barRef,
}: {
  tip: ActiveTip | null;
  barRef: RefObject<HTMLElement | null>;
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // Clamp inside the bar once the bubble has a measured width. The render below
  // positions it on the control's centre; this correction writes the clamped
  // left straight to the node (an external system — no setState, no cascading
  // render) in a LAYOUT effect, so it lands before paint and never slides.
  // jsdom has no layout, so every rect is 0 there and the bubble stays put: the
  // clamp is exercised in the browser specs.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    const bar = barRef.current;
    if (!tip || !bubble || !bar) return;
    const width = bubble.getBoundingClientRect().width;
    const barWidth = bar.getBoundingClientRect().width;
    const pad = 8;
    const half = width / 2;
    bubble.style.left = `${
      barWidth > width + pad * 2
        ? Math.min(Math.max(tip.center, half + pad), barWidth - half - pad)
        : barWidth / 2
    }px`;
  }, [tip, barRef]);

  return (
    <div className="pointer-events-none relative -mb-0.5 h-0">
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
