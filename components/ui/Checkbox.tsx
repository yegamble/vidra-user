"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Visible label; the `<label>` wraps the input so no id wiring is needed. */
  label: ReactNode;
};

/**
 * Checkbox — a native checkbox wrapped in its own `<label>` (so the whole row
 * is the click/hit target and the association is implicit). Uses the browser's
 * accent-color for the check so the control stays native + accessible.
 */
export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
      <input
        type="checkbox"
        className={cn("h-4 w-4 rounded border-border accent-accent focus-ring", className)}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
