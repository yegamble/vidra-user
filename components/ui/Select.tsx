"use client";

import { useId, type SelectHTMLAttributes } from "react";

import { ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

/**
 * Select — a labeled native `<select>` (native so keyboard + screen-reader
 * behavior is the platform's, not a re-implementation). Options are passed as
 * children. A decorative chevron overlays the right edge; the select itself
 * keeps the accessible interaction.
 */
export function Select({ label, hint, error, id, className, children, ...props }: SelectProps) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = cn(error ? errorId : undefined, hint ? hintId : undefined) || undefined;

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={fieldId} className="text-sm font-medium text-fg">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <select
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "w-full appearance-none rounded-md border bg-surface px-3 py-2 pr-9 text-sm text-fg focus-ring disabled:opacity-60",
            error ? "border-danger" : "border-border",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDownIcon
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted"
        />
      </div>
      {hint && !error ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
