"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export type ModalProps = {
  /** Visible title, rendered as the dialog's <h2> and its accessible name. */
  title: string;
  /** Called on Escape, overlay click, or the close button. */
  onClose: () => void;
  children: ReactNode;
  /** Hide the header close (X) button (e.g. a modal with only action buttons). */
  hideClose?: boolean;
  /** Extra classes for the dialog panel (e.g. a wider max-width). */
  className?: string;
};

/**
 * Modal — an accessible dialog. Renders `role="dialog" aria-modal="true"`
 * labeled by its `<h2>` title. Behaviors:
 *  - focus moves into the dialog on open and is restored to the previously
 *    focused element on close;
 *  - Tab / Shift+Tab are trapped within the dialog (focus wraps);
 *  - Escape and a click on the backdrop both call `onClose`.
 *
 * The panel itself is a plain container so callers compose the body + footer
 * buttons freely.
 */
export function Modal({ title, onClose, children, hideClose = false, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // Move focus into the dialog: first focusable element, else the panel.
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (focusables && focusables.length > 0) {
      focusables[0].focus();
    } else {
      panel?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // The FOCUSABLE selector already excludes disabled controls and
      // tabindex="-1"; that is sufficient for our dialogs (no conditionally
      // hidden focusables live inside them).
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
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
      // Restore focus to whatever opened the modal.
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "w-full max-w-md rounded-2xl border border-border-subtle bg-surface p-5 shadow-2xl focus:outline-none",
          className,
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-fg">
            {title}
          </h2>
          {hideClose ? null : (
            <IconButton label={t("common.close")} size="sm" onClick={onClose}>
              <CloseIcon size={18} />
            </IconButton>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
