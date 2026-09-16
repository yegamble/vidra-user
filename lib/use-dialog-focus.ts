"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * The focusable-element selector every dialog in this app traps against. It
 * already excludes disabled controls and `tabindex="-1"`, which is sufficient
 * for our dialogs (no conditionally hidden focusables live inside them).
 */
export const DIALOG_FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * useDialogFocus — the modal focus contract, in one place:
 *
 *  - focus moves into the panel on mount (first focusable, else the panel);
 *  - Tab / Shift+Tab wrap inside the panel;
 *  - Escape calls `onClose` (and stops propagating, so a dialog opened from
 *    inside another surface does not also dismiss that surface);
 *  - focus returns to whatever was focused before, on unmount.
 *
 * Extracted from `components/ui/Modal.tsx` when the app grew a SECOND modal
 * surface (the immersive sidebar drawer). Two hand-rolled traps is how the two
 * drift — one of them ends up without a restore, or with a different
 * focusable-selector — so the seam is shared instead of copied.
 *
 * MOUNT-ONLY by design. The caller's `onClose` is read through a ref, so a
 * fresh inline `onClose={() => …}` on every render cannot re-run the effect —
 * re-running it would re-focus the first focusable and steal focus out of
 * whatever the user is typing in (the bug this ref shape was written for).
 * Callers therefore mount the panel when it opens and unmount it when it
 * closes, which both existing callers already do.
 */
export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const focusables = panel?.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE);
    if (focusables && focusables.length > 0) {
      focusables[0].focus();
    } else {
      panel?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE));
      if (items.length === 0) {
        // Nothing focusable but the panel itself — keep focus on it.
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: see the doc comment.
  }, []);
}
