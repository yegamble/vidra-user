"use client";

import { useId, useRef, type ReactNode } from "react";

import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useDialogFocus } from "@/lib/use-dialog-focus";

export type ModalProps = {
  /** Visible title, rendered as the dialog's <h2> and its accessible name. */
  title: string;
  /** Called on Escape, overlay click, or the close button. */
  onClose: () => void;
  children: ReactNode;
  /** Hide the header close (X) button (e.g. a modal with only action buttons). */
  hideClose?: boolean;
  /**
   * Skin: `dialog` (default) is the centered desktop dialog; `sheet` is the
   * mobile bottom-sheet (bottom-anchored, grab handle, safe-area padding).
   * Both share the exact same a11y contract.
   */
  variant?: "dialog" | "sheet";
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
export function Modal({
  title,
  onClose,
  children,
  hideClose = false,
  variant = "dialog",
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Initial focus, the Tab trap, Escape and focus restore — the shared dialog
  // contract (lib/use-dialog-focus), which the immersive sidebar drawer uses
  // too. It is mount-only and reads onClose through a ref, so a caller's fresh
  // inline `onClose={() => …}` on every render cannot re-focus the first
  // focusable mid-typing (the bug that shape exists for).
  useDialogFocus(panelRef, onClose);

  const isSheet = variant === "sheet";
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center bg-black/45",
        // Desktop dialog centers; the bottom sheet sticks to the bottom edge.
        isSheet ? "items-end" : "items-center p-4",
      )}
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
          "bg-canvas focus:outline-none",
          isSheet
            ? // Mobile bottom-sheet: full-bleed, rounded top, safe-area footer.
              "w-full rounded-t-[22px] px-5 pb-[max(env(safe-area-inset-bottom),2.75rem)] pt-3"
            : // Desktop dialog: ~440px, soft shadow (borderless — the shadow separates it).
              "w-full max-w-md rounded-[20px] p-6 shadow-soft-strong",
          className,
        )}
      >
        {isSheet ? (
          <div
            aria-hidden="true"
            className="mx-auto mb-3 h-1 w-9 rounded-full bg-border"
          />
        ) : null}
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
