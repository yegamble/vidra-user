"use client";

import { useId, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

/**
 * Textarea — the multi-line sibling of `<Input>`, same label/hint/error wiring
 * and token styling.
 */
export function Textarea({ label, hint, error, id, className, ...props }: TextareaProps) {
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
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "w-full rounded-xl border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted focus-ring disabled:opacity-60",
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
