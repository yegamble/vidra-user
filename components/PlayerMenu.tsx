"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface PlayerMenuItem<T extends string | number> {
  value: T;
  label: string;
}

// PlayerMenu is the player's shared accessible menu-button primitive (quality +
// speed selectors): a labelled button opening a role="menu" of menuitemradio
// entries. Keyboard: Enter/Space/ArrowDown open and focus the checked item,
// arrows cycle, Escape/outside-click closes (Escape returns focus to the
// button). Selection closes the menu and restores focus to the button.
export function PlayerMenu<T extends string | number>({
  buttonLabel,
  menuLabel,
  icon,
  items,
  current,
  onSelect,
}: {
  buttonLabel: string;
  menuLabel: string;
  icon: ReactNode;
  items: PlayerMenuItem<T>[];
  current: T;
  onSelect: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

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
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {icon}
        <span>{buttonLabel}</span>
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
          className="absolute bottom-full left-0 z-20 mb-2 w-36 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
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
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
