"use client";

import { cn } from "@/lib/cn";

export type ToggleProps = {
  /** Current on/off state (controlled). */
  checked: boolean;
  /** Called with the next state when toggled by click, Space, or Enter. */
  onChange: (next: boolean) => void;
  /** Accessible name for the switch (required — it has no visible text). */
  label: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Toggle — an accessible on/off switch built on a `<button role="switch">`
 * (aria-checked reflects state). A button gives Space/Enter activation for free;
 * the track/thumb are purely visual. Use for instant-effect settings (not form
 * submission — use Checkbox inside forms).
 */
export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-ring disabled:pointer-events-none disabled:opacity-60",
        checked ? "bg-accent" : "bg-surface-muted",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
