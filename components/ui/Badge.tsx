import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "inverse"
  | "strong";

const VARIANT: Record<BadgeVariant, string> = {
  neutral: "bg-surface-muted text-fg-muted",
  accent: "bg-accent text-accent-fg",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
  // Role pills: ADMIN reads as an inverse chip; MOD as a quieter strong-fill chip.
  inverse: "bg-fg text-canvas",
  strong: "bg-surface-strong text-fg-muted",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  /**
   * The design's uppercase micro-status style (PUBLISHED / PROCESSING / IN REVIEW
   * / DRAFT / FAILED, and the ADMIN / MOD role pills): 10.5px, bold, uppercase,
   * letter-spaced. Default false keeps the softer sentence-case pill.
   */
  status?: boolean;
};

/**
 * Badge — a small status pill (privacy, state, counts, "Verified"/"Unverified",
 * live/offline, role, …). Purely presentational; when it conveys state that isn't
 * in adjacent text, give it an accessible label at the call site.
 */
export function Badge({ variant = "neutral", status = false, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full",
        status
          ? "px-2 py-[2.5px] text-[10.5px] font-bold uppercase tracking-[0.04em]"
          : "px-2 py-0.5 text-xs font-medium",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
