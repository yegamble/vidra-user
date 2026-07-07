"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface PlayerMenuItem<T extends string | number> {
  value: T;
  label: string;
}

// Where the menu-button lives, which is all `variant` changes — the accessible
// menu machinery (roles, focus, arrows, Escape) is identical for both:
// - "bar":     a themed pill on a normal surface (the legacy below-player row).
// - "overlay": a white-on-scrim control INSIDE the player's media overlay, per
//              the design-system's documented media-overlay exception (white
//              controls on the video surface). ≥44pt hit area, compact label.
export type PlayerMenuVariant = "bar" | "overlay";

// PlayerMenu is the player's shared accessible menu-button primitive (quality +
// speed selectors): a labelled button opening a role="menu" of menuitemradio
// entries. Keyboard: Enter/Space/ArrowDown open and focus the checked item,
// arrows cycle, Escape/outside-click closes (Escape returns focus to the
// button). Selection closes the menu and restores focus to the button.
//
// `buttonLabel` is the accessible name (aria-label + tooltip); `buttonText` is
// the shorter visible label (defaults to buttonLabel). On the overlay variant
// the visible text is the tail of the accessible name (e.g. "Normal" of
// "Speed: Normal"), so it stays contained in the accessible name (WCAG 2.5.3).
export function PlayerMenu<T extends string | number>({
  buttonLabel,
  buttonText,
  menuLabel,
  icon,
  items,
  current,
  onSelect,
  variant = "bar",
}: {
  buttonLabel: string;
  buttonText?: string;
  menuLabel: string;
  icon: ReactNode;
  items: PlayerMenuItem<T>[];
  current: T;
  onSelect: (value: T) => void;
  variant?: PlayerMenuVariant;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const overlay = variant === "overlay";
  // On the overlay the visible text is a compact tail (aria-label carries the
  // full name); the legacy bar shows the full label as its visible text (and so
  // as its accessible name, unchanged).
  const visibleText = overlay ? (buttonText ?? buttonLabel) : buttonLabel;

  // Focus the checked entry when the menu opens.
  useEffect(() => {
    if (!open) return;
    const checked = items.findIndex((item) => item.value === current);
    itemRefs.current[checked >= 0 ? checked : 0]?.focus();
  }, [open, items, current]);

  // Close on a click/tap outside the menu.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function moveFocus(from: number, delta: number) {
    const next = (from + delta + items.length) % items.length;
    itemRefs.current[next]?.focus();
  }

  function select(value: T) {
    onSelect(value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={overlay ? buttonLabel : undefined}
        title={overlay ? buttonLabel : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold transition-colors",
          overlay
            ? "h-11 rounded-full px-2 text-[13px] text-white/90 hover:bg-white/15 hover:text-white"
            : "rounded-full bg-surface-muted px-4 py-2 text-[13px] text-fg hover:bg-surface-strong",
        )}
      >
        {icon}
        <span className="tabular-nums">{visibleText}</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={menuLabel}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
          className="absolute bottom-full right-0 z-30 mb-2 max-h-[min(16rem,55vh)] w-40 overflow-y-auto overscroll-contain rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-lg"
        >
          {items.map((item, i) => (
            <button
              key={item.value}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={item.value === current}
              tabIndex={-1}
              onClick={() => select(item.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  moveFocus(i, 1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  moveFocus(i, -1);
                }
              }}
              className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-surface-muted"
            >
              <span aria-hidden="true" className="w-4">
                {item.value === current ? "✓" : ""}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
