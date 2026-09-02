"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { CheckIcon } from "@/components/icons";
import { anchoredPosition } from "@/lib/anchored-position";
import { cn } from "@/lib/cn";

export interface PlayerMenuItem<T extends string | number> {
  value: T;
  label: string;
}

// Where the menu-button lives, which is all `variant` changes — the accessible
// menu machinery (roles, focus, arrows, Escape) is identical for both:
// - "bar":     a themed pill on a normal surface (the legacy below-player row).
// - "overlay": a white-on-scrim control INSIDE the player's media overlay, per
//              the design-system's documented media-overlay exception (white
//              controls on the video surface). ≥44pt hit area, compact label.
export type PlayerMenuVariant = "bar" | "overlay";

// PlayerMenu is the player's shared accessible menu-button primitive (quality +
// speed selectors): a labelled button opening a role="menu" of menuitemradio
// entries. Keyboard: Enter/Space/ArrowDown open and focus the checked item,
// arrows cycle, Escape/outside-click closes (Escape returns focus to the
// button). Selection closes the menu and restores focus to the button.
//
// `buttonLabel` is the accessible name (aria-label + tooltip); `buttonText` is
// the shorter visible label (defaults to buttonLabel). On the overlay variant
// the visible text is the tail of the accessible name (e.g. "1.5×" of
// "Speed: 1.5×"), so it stays contained in the accessible name (WCAG 2.5.3).
export function PlayerMenu<T extends string | number>({
  buttonLabel,
  buttonText,
  menuLabel,
  icon,
  items,
  current,
  onSelect,
  variant = "bar",
}: {
  buttonLabel: string;
  buttonText?: string;
  menuLabel: string;
  icon: ReactNode;
  items: PlayerMenuItem<T>[];
  current: T;
  onSelect: (value: T) => void;
  variant?: PlayerMenuVariant;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const overlay = variant === "overlay";
  // Portal target + fixed coordinates (the Wave D pattern, see
  // lib/anchored-position). The player stage is `overflow-hidden` and only ~185px
  // tall on a phone, so an `absolute` menu inside it was CLIPPED: 7 of the speed
  // ladder's 12 rungs rendered above the video's top edge and could not be
  // reached at all. Fixed-positioned in a portal, the menu is bounded by the
  // viewport instead. While the player is fullscreen the portal must land INSIDE
  // the fullscreen element — nothing under <body> is painted in that state.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // On the overlay the visible text is a compact tail (aria-label carries the
  // full name); the legacy bar shows the full label as its visible text (and so
  // as its accessible name, unchanged).
  const visibleText = overlay ? (buttonText ?? buttonLabel) : buttonLabel;

  const measure = useCallback(() => {
    const trigger = buttonRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const next = anchoredPosition(
      trigger.getBoundingClientRect(),
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      // The trigger sits in the control bar on the player's bottom edge, so
      // "above" is the natural side; anchoredPosition flips it down only when
      // the space above genuinely cannot hold the menu.
      { align: "end", prefer: "above" },
    );
    // Reuse the previous object when nothing moved: this runs on every scroll
    // event, and a fresh object each time would re-render the menu (and every
    // row) continuously while the user scrolls it.
    setPos((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
  }, []);

  // Resolving the portal target in the OPEN handler rather than in an effect
  // keeps it a single render (and avoids a setState-in-effect cascade).
  const portalTarget = () => (document.fullscreenElement as HTMLElement | null) ?? document.body;
  const openMenu = useCallback(() => {
    setContainer(portalTarget());
    setOpen(true);
  }, []);
  const closeMenu = useCallback(() => {
    setOpen(false);
    setContainer(null);
    setPos(null);
  }, []);

  // Re-resolve the target if fullscreen is entered or left with the menu open:
  // the two roots are disjoint, so a menu left under <body> simply vanishes.
  useEffect(() => {
    if (!open) return;
    const onFullscreenChange = () => setContainer(portalTarget());
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [open]);

  // useLayoutEffect, not useEffect: the position is measured and applied before
  // the browser paints, so the menu never flashes at the viewport origin. Do NOT
  // add a `visibility: hidden` guard for the unmeasured frame — setPos from a
  // layout effect makes React flush the pending focus effect below while the
  // menu is still hidden, and focus() is a silent no-op on a visibility:hidden
  // subtree. Focus then never entered the menu, so its own key handler never saw
  // Escape and the menu would not close. jsdom does not model this; only a real
  // browser catches it (e2e/hls.spec.ts).
  useLayoutEffect(() => {
    if (!open || !container) return;
    measure();
  }, [open, container, items.length, measure]);

  // Keep the fixed menu pinned to its trigger: capture-phase scroll catches any
  // scrolling ancestor, resize re-runs the flip (phone rotation into landscape
  // fullscreen is the case that matters here).
  useEffect(() => {
    if (!open) return;
    const onReflow = () => measure();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, measure]);

  // Focus the checked entry when the menu OPENS — keyed on `open` ALONE.
  //
  // This used to depend on [open, items, current]. Every caller rebuilds
  // `items` on each render (SpeedMenu maps PLAYBACK_RATES, QualityMenu maps
  // levels), so the array identity changed on every render and re-ran this
  // effect, re-focusing the checked row and dragging the menu's scrollbox back
  // to it mid-interaction. The ladder is taller than the menu's max-height, so
  // the observable bug was: scroll down to 4x, press it, and the menu snaps
  // back to 1x before the pointer is released — the press lands on the menu
  // instead of the row and the rate never changes. Latest props reach the
  // effect through refs instead.
  const latestRef = useRef({ items, current });
  useEffect(() => {
    latestRef.current = { items, current };
  });
  useEffect(() => {
    // `container` is part of the key because the rows do not exist until the
    // portal mounts: on `open` alone this ran a render too early, against an
    // empty itemRefs. It changes only on open/close/fullscreen, never per
    // render, so it does not reintroduce the focus-stealing above.
    if (!open || !container) return;
    const { items: list, current: checkedValue } = latestRef.current;
    const checked = list.findIndex((item) => item.value === checkedValue);
    itemRefs.current[checked >= 0 ? checked : 0]?.focus();
  }, [open, container]);

  // Close on a click/tap outside the menu.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      // The menu is portaled out of rootRef, so a press inside it must still
      // count as inside — otherwise picking a rung would close before the click.
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, closeMenu]);

  function moveFocus(from: number, delta: number) {
    const next = (from + delta + items.length) % items.length;
    itemRefs.current[next]?.focus();
  }

  function select(value: T) {
    onSelect(value);
    closeMenu();
    buttonRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={overlay ? buttonLabel : undefined}
        title={overlay ? buttonLabel : undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openMenu();
          }
        }}
        className={cn(
          "focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold transition-colors",
          overlay
            ? "h-11 rounded-full px-2 text-[13px] text-white/90 hover:bg-white/15 hover:text-white"
            : "rounded-full bg-surface-muted px-4 py-2 text-[13px] text-fg hover:bg-surface-strong",
        )}
      >
        {icon}
        <span className="tabular-nums">{visibleText}</span>
      </button>
      {open && container
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={menuLabel}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  closeMenu();
                  buttonRef.current?.focus();
                }
              }}
              style={{
                position: "fixed",
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
              }}
              className="z-50 max-h-[min(16rem,calc(100vh-1rem))] w-40 overflow-y-auto overscroll-contain rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-lg"
            >
              {items.map((item, i) => (
                <button
                  key={item.value}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.value === current}
                  tabIndex={-1}
                  onClick={() => select(item.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      moveFocus(i, 1);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      moveFocus(i, -1);
                    }
                  }}
                  className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-surface-muted"
                >
                  <span aria-hidden="true" className="flex w-4 justify-center">
                    {item.value === current ? <CheckIcon size={16} /> : null}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            container,
          )
        : null}
    </div>
  );
}
