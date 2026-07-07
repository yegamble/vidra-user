import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type OverlayButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /**
   * Accessible name — REQUIRED. These controls are icon-only, so the label is
   * the only thing a screen reader announces (also the hover tooltip).
   */
  label: string;
  /** Reflected as aria-pressed for toggle controls (mute, captions, PiP, theater). */
  pressed?: boolean;
};

/**
 * OverlayButton — an icon-only control that lives INSIDE the player's media
 * overlay: white-on-scrim per the design-system's documented media-overlay
 * exception (never a theme token, since it sits on the video, not a surface),
 * with a 44×44pt hit area and the shared focus ring. `label` is mandatory.
 */
export function OverlayButton({
  label,
  pressed,
  type = "button",
  className,
  children,
  ...props
}: OverlayButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white disabled:pointer-events-none disabled:opacity-50",
        pressed && "text-white",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
