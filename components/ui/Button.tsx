import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tonal"
  | "danger"
  | "danger-outline"
  | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent/90",
  secondary: "border border-border bg-surface text-fg hover:bg-surface-muted",
  // The design's dominant secondary: a borderless muted-fill pill (watch actions,
  // the IPFS source toggle, Share/Download/Save). Deepens one step on hover.
  tonal: "bg-surface-muted text-fg hover:bg-surface-strong",
  danger: "bg-danger-solid text-danger-fg hover:bg-danger-solid/90",
  // Low-emphasis destructive (Remove / Reject / Delete / Cancel upload): a hairline
  // danger outline on a transparent fill, danger text. Uses the AA-safe `danger`
  // text token (not the solid fill).
  "danger-outline":
    "border border-danger/45 bg-transparent text-danger hover:bg-danger/10",
  ghost: "text-fg hover:bg-surface-muted",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3.5 py-1.5 text-[13px] sm:min-h-8",
  md: "min-h-11 px-4 py-2 text-sm",
  lg: "min-h-12 px-5 py-2.5 text-base",
};

/**
 * buttonClasses is the shared class recipe behind both `<Button>` (a real
 * `<button>`) and `<LinkButton>` (a Next `<Link>` that looks like a button), so
 * the two never drift. Token-driven (bg-accent / border-border / …) so the look
 * flips in dark mode and reskins from globals.css; `focus-ring` centralizes the
 * keyboard focus outline.
 */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    // Redesign: buttons are rounded-[10px] (not capsule). Chips/badges/avatars
    // stay capsule; IconButton stays round.
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-colors focus-ring disabled:pointer-events-none disabled:opacity-60",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * Button — the primitive `<button>`. Defaults to `type="button"` (so a button
 * inside a form never accidentally submits it; pass `type="submit"`
 * explicitly). Icon-only buttons must use `IconButton` (it enforces a label).
 */
export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}
