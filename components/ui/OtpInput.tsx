"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";

export type OtpInputProps = {
  /** Number of digit boxes (the design's two-factor screen uses 6). */
  length?: number;
  /**
   * Accessible name for the whole control (e.g. "Authentication code"). The
   * group carries it; each box is named "<label> digit N" so a screen reader
   * announces position, and tests can target an individual box.
   */
  label: string;
  /** Fires with the concatenated digits on every change (may be < length). */
  onChange: (value: string) => void;
  /** Fires once all `length` boxes are filled — e.g. to auto-submit. */
  onComplete?: (value: string) => void;
  /** Focus the first box on mount (the two-factor screen wants this). */
  autoFocus?: boolean;
  disabled?: boolean;
};

// OtpInput is the design's segmented one-time-code entry: `length` single-digit
// boxes that auto-advance as you type, backspace to the previous box, accept a
// pasted code, and combine into one numeric string. Filled boxes take the
// design's solid `border-fg`; empty boxes stay `border-border`. It is the
// controlled-by-parent shape used by the two-factor login screen — the parent
// keeps the combined value for the challenge request and remounts (via `key`)
// to reset it when switching to the recovery-code path.
export function OtpInput({
  length = 6,
  label,
  onChange,
  onComplete,
  autoFocus = false,
  disabled = false,
}: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length }, () => ""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function commit(next: string[]) {
    setDigits(next);
    const combined = next.join("");
    onChange(combined);
    if (combined.length === length && onComplete) onComplete(combined);
  }

  function focusBox(index: number) {
    const clamped = Math.max(0, Math.min(length - 1, index));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  }

  function handleChange(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (clean === "") {
      // The box was cleared (e.g. selecting then deleting).
      const next = digits.slice();
      next[index] = "";
      commit(next);
      return;
    }
    const next = digits.slice();
    if (clean.length === 1) {
      next[index] = clean;
      commit(next);
      focusBox(index + 1);
      return;
    }
    // Multiple digits arrived at once (paste, autofill, or fast typing): spread
    // them across this box and the ones after it.
    for (let k = 0; k < clean.length && index + k < length; k++) {
      next[index + k] = clean[k];
    }
    commit(next);
    focusBox(index + clean.length);
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index] === "" && index > 0) {
        // Empty box: step back and clear the previous one.
        e.preventDefault();
        const next = digits.slice();
        next[index - 1] = "";
        commit(next);
        focusBox(index - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(index + 1);
    }
  }

  function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pasted === "") return;
    e.preventDefault();
    const next = digits.slice();
    for (let k = 0; k < pasted.length && index + k < length; k++) {
      next[index + k] = pasted[k];
    }
    commit(next);
    focusBox(index + pasted.length);
  }

  return (
    <div role="group" aria-label={label} className="flex justify-center gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          autoFocus={autoFocus && i === 0}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          aria-label={`${label} digit ${i + 1}`}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          className={cn(
            "focus-ring h-[52px] w-11 rounded-[11px] border-[1.5px] bg-surface text-center text-[22px] font-bold tabular-nums text-fg disabled:opacity-60",
            digit ? "border-fg" : "border-border",
          )}
        />
      ))}
    </div>
  );
}
