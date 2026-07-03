import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type BadgeVariant = "neutral" | "accent" | "success" | "danger" | "warning";

const VARIANT: Record<BadgeVariant, string> = {
  neutral: "bg-surface-muted text-fg-muted",
  accent: "bg-accent text-accent-fg",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

/**
 * Badge — a small status pill (privacy, state, counts, "Verified"/"Unverified",
 * live/offline, …). Purely presentational; when it conveys state that isn't in
 * adjacent text, give it an accessible label at the call site.
 */
export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
