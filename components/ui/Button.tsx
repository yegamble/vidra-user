import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "border border-border bg-surface text-fg hover:bg-surface-muted",
  danger: "bg-danger text-danger-fg hover:opacity-90",
  ghost: "text-fg hover:bg-surface-muted",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-3 py-2 text-sm",
  lg: "px-4 py-2.5 text-base",
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
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-opacity focus-ring disabled:pointer-events-none disabled:opacity-60",
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
