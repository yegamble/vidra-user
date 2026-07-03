"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Visible label; the `<label>` wraps the input for an implicit association. */
  label: ReactNode;
};

/**
 * Radio — a native radio wrapped in its `<label>`. Group members share a
 * `name`; the browser handles roving focus + arrow-key selection within the
 * group natively.
 */
export function Radio({ label, className, ...props }: RadioProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
      <input
        type="radio"
        className={cn("h-4 w-4 border-border accent-accent focus-ring", className)}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
