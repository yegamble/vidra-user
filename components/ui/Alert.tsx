import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Which tone the message carries. `danger` is the inline form/action failure
 * (the tinted red box under a form); `success` is its confirmation counterpart.
 * Deliberately only two: the block-level "this whole panel failed" state is
 * `ErrorState`, and the transient toast is `Toast` — an Alert is the *inline*
 * message that sits inside a form or a settings section.
 */
export type AlertVariant = "danger" | "success";

// Danger uses the opaque danger-surface tint plus a border (matching `Badge`'s
// note: systemRed text cannot clear AA on a 15% red fill); success needs no
// border because the /15 green already reads as a distinct block.
const VARIANT: Record<AlertVariant, string> = {
  danger: "border border-danger-border bg-danger-surface text-danger",
  success: "bg-success/15 text-success",
};

/**
 * The implicit ARIA role per tone. A failure interrupts (`alert`, assertive); a
 * confirmation does not (`status`, polite). Both are announced — the point of
 * having one component is that no call site can forget the role, which is how
 * silent-to-screen-reader error messages happen.
 */
const ROLE: Record<AlertVariant, "alert" | "status"> = {
  danger: "alert",
  success: "status",
};

export type AlertProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  variant?: AlertVariant;
  /**
   * The element to render. Defaults to `p` — an alert is one sentence. Pass
   * `"div"` when the message is itself block content (a list, several
   * paragraphs), because a `<p>` may not contain them.
   */
  as?: "p" | "div";
  children: ReactNode;
};

/**
 * Alert — the inline message box under a form or settings section. One
 * component instead of the class string that was pasted into two dozen auth and
 * settings surfaces, so the tint, the padding and (most importantly) the ARIA
 * role stay identical everywhere.
 *
 * Note `cn` is a plain join, not `tailwind-merge`: a `className` that fights a
 * base utility (padding, text color) does NOT reliably win. Extend with
 * additive classes only — layout (`flex flex-col gap-2`), width, margins.
 */
export function Alert({
  variant = "danger",
  as: Tag = "p",
  className,
  children,
  ...props
}: AlertProps) {
  return (
    <Tag
      role={ROLE[variant]}
      className={cn("rounded-xl px-3.5 py-2.5 text-sm", VARIANT[variant], className)}
      {...props}
    >
      {children}
    </Tag>
  );
}
