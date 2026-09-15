"use client";

import type { ButtonHTMLAttributes, Ref } from "react";

import { MEDIA_PRESS } from "@/components/player/chrome";
import { usePlayerTipProps } from "@/components/player/PlayerTooltip";
import { cn } from "@/lib/cn";

export type OverlayButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /**
   * Accessible name — REQUIRED. These controls are icon-only, so the label is
   * the only thing a screen reader announces (and, by default, the text the
   * bar's hover tooltip shows).
   */
  label: string;
  /** Tooltip text when it should read differently from the accessible name. */
  tip?: string;
  /** Keyboard shortcut shown as a keycap inside the tooltip (e.g. "C"). */
  tipKeys?: string;
  /** Reflected as aria-pressed for toggle controls (mute, captions, PiP, theater). */
  pressed?: boolean;
  /** Forwarded to the button (React 19 passes `ref` as a plain prop). */
  ref?: Ref<HTMLButtonElement>;
};

/**
 * OverlayButton — an icon-only control that lives INSIDE the player's media
 * overlay. White-on-scrim per the design-system's documented media-overlay
 * exception (never a theme token, since it sits on the video, not a surface):
 * a 44×44pt round target holding a 22px filled glyph from
 * `components/player/icons`, with a white hover disc, a white focus glow
 * (`.focus-ring-media`, NOT the app's accent ring, which is a themed colour
 * that disappears on the wrong frame) and — for toggles — a white underline
 * under the glyph when they are ON.
 *
 * It carries NO `title`: the bar draws one shared tooltip above the transport,
 * and a native title on top of that is the same words twice, in two places, at
 * two different delays.
 */
export function OverlayButton({
  label,
  tip,
  tipKeys,
  pressed,
  type = "button",
  className,
  children,
  ref,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onPointerDown,
  onPointerUp,
  onFocus,
  onBlur,
  onClick,
  ...props
}: OverlayButtonProps) {
  const tipProps = usePlayerTipProps<HTMLButtonElement>(tip ?? label, tipKeys, {
    onPointerEnter,
    onPointerMove,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    onFocus,
    onBlur,
    onClick,
  });

  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "focus-ring-media relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full",
        MEDIA_PRESS,
        "hover:bg-white/12 hover:text-white disabled:pointer-events-none disabled:opacity-50",
        // Ternary, not `pressed && "text-white"`: cn() is a plain concat with no
        // tailwind-merge, so an appended override loses to whichever of the two
        // same-group utilities the STYLESHEET emits later — the pressed state
        // was silently a no-op.
        pressed ? "text-white" : "text-white/90",
        className,
      )}
      {...tipProps}
      {...props}
    >
      {children}
      {/* The ON indicator a sighted viewer reads — aria-pressed is what a screen
          reader reads. YouTube's underline idiom; never for play/pause, which
          is a momentary action with no "on" state (it passes no `pressed`). */}
      {pressed ? (
        <span
          aria-hidden="true"
          data-on-indicator=""
          className="pointer-events-none absolute bottom-[7px] h-[2px] w-3.5 rounded-full bg-white"
        />
      ) : null}
    </button>
  );
}
