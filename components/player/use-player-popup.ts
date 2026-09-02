"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { anchoredPosition } from "@/lib/anchored-position";

/**
 * usePlayerPopup is the shared open/placement machinery for the player's
 * overlay popups (PlayerMenu's speed + quality ladders, and the control bar's
 * overflow menu). It exists so those popups cannot drift apart on the three
 * things that are easy to get subtly wrong:
 *
 * 1. **Escaping the stage.** The player stage is `overflow-hidden` and only
 *    ~185px tall on a phone, so an in-stage `absolute` popup gets clipped by
 *    the top edge of the video. Popups are portaled out and positioned
 *    `fixed` — the design system's documented Wave D pattern.
 * 2. **Fullscreen.** The portal must target `document.fullscreenElement` while
 *    the player is fullscreen; nothing under <body> is painted in that state,
 *    so a popup portaled there would simply vanish.
 * 3. **Placement.** Trigger-anchored, flipped and clamped to the viewport by
 *    `anchoredPosition`, and re-measured on scroll/resize.
 */
export function usePlayerPopup() {
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const trigger = buttonRef.current;
    const popup = popupRef.current;
    if (!trigger || !popup) return;
    const next = anchoredPosition(
      trigger.getBoundingClientRect(),
      { width: popup.offsetWidth, height: popup.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      // The trigger sits in the control bar on the player's bottom edge, so
      // "above" is the natural side; anchoredPosition flips it down only when
      // the space above genuinely cannot hold the popup.
      { align: "end", prefer: "above" },
    );
    // Reuse the previous object when nothing moved: this runs on every scroll
    // event, and a fresh object each time would re-render every row of the
    // popup continuously while the user scrolls it.
    setPos((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
  }, []);

  // Resolving the portal target in the OPEN handler rather than in an effect
  // keeps it a single render (and avoids a setState-in-effect cascade).
  const portalTarget = () => (document.fullscreenElement as HTMLElement | null) ?? document.body;
  const openPopup = useCallback(() => {
    setContainer(portalTarget());
    setOpen(true);
  }, []);
  const closePopup = useCallback(() => {
    setOpen(false);
    setContainer(null);
    setPos(null);
  }, []);

  // Re-resolve the target if fullscreen is entered or left with the popup open:
  // the two roots are disjoint, so a popup left under <body> simply vanishes.
  useEffect(() => {
    if (!open) return;
    const onFullscreenChange = () => setContainer(portalTarget());
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [open]);

  // useLayoutEffect, not useEffect: the position is measured and applied before
  // the browser paints, so the popup never flashes at the viewport origin. Do
  // NOT add a `visibility: hidden` guard for the unmeasured frame — setPos from
  // a layout effect makes React flush pending passive effects (including the
  // caller's focus-on-open) while the popup is still hidden, and focus() is a
  // silent no-op on a visibility:hidden subtree. That regressed Escape-to-close:
  // focus never entered the popup, so its key handler never saw the key. jsdom
  // does not model this; only a real browser catches it.
  useLayoutEffect(() => {
    if (!open || !container) return;
    measure();
  }, [open, container, measure]);

  // Keep the fixed popup pinned to its trigger: capture-phase scroll catches any
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

  // Close on a press outside. The popup is portaled out of rootRef, so a press
  // inside it must still count as inside — otherwise picking a row would close
  // the popup before the click landed.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      closePopup();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, closePopup]);

  return {
    open,
    container,
    rootRef,
    buttonRef,
    popupRef,
    openPopup,
    closePopup,
    remeasure: measure,
    /** Spread onto the popup element; pairs with `container` for createPortal. */
    popupStyle: { position: "fixed" as const, top: pos?.top ?? 0, left: pos?.left ?? 0 },
  };
}
