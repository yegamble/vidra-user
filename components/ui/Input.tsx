"use client";

import { useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Visible label rendered above the field and wired via htmlFor/id. */
  label?: string;
  /** Helper text shown below the field (hidden while an error shows). */
  hint?: string;
  /** Error text; also sets aria-invalid + a danger border + aria-describedby. */
  error?: string;
};

/**
 * Input — a labeled text field. Generates an id (via useId) when none is passed
 * so the `<label htmlFor>` / input association is always correct, wires
 * aria-invalid + aria-describedby for the error/hint, and centralizes the
 * border/focus styling on tokens. Any native input prop (type, name, value,
 * onChange, autoComplete, required, …) passes straight through.
 */
export function Input({ label, hint, error, id, className, ...props }: InputProps) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = cn(error ? errorId : undefined, hint ? hintId : undefined) || undefined;

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-fg">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-11 w-full rounded-xl border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted focus-ring disabled:opacity-60",
          error ? "border-danger" : "border-border",
          className,
        )}
        {...props}
      />
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
