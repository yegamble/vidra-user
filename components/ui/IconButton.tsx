import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type IconButtonSize = "sm" | "md";

const SIZE: Record<IconButtonSize, string> = {
  sm: "p-1.5",
  md: "p-2",
};

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /**
   * Accessible name — REQUIRED. An icon-only control has no visible text, so
   * the label is the only thing a screen reader announces. Enforced by the
   * type (it is not optional).
   */
  label: string;
  size?: IconButtonSize;
};

/**
 * IconButton — an icon-only button. The `label` prop is mandatory and becomes
 * both the `aria-label` and the native `title` (hover tooltip), so an icon
 * control is never unlabeled.
 */
export function IconButton({
  label,
  size = "md",
  type = "button",
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-full text-fg-muted transition-colors focus-ring hover:bg-surface-muted hover:text-fg disabled:pointer-events-none disabled:opacity-60",
        SIZE[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
