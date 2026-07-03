"use client";

import { useEffect, useRef, useState } from "react";

import type { LevelOption } from "@/lib/hls";

// QualityMenu is the player's quality selector: a menu button ("Quality: Auto")
// opening a role="menu" of menuitemradio entries (Auto + one per rendition
// height) driving hls.js level selection. Rendered only for hls.js playback —
// native-HLS and original playback expose nothing controllable, so the menu
// hides there (the caller passes no levels). Keyboard: Enter/Space/ArrowDown
// open and focus the checked item, arrows cycle, Escape/outside-click closes
// (Escape returns focus to the button).
export function QualityMenu({
  levels,
  currentLevel,
  onSelect,
}: {
  levels: LevelOption[];
  currentLevel: number;
  onSelect: (level: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Focus the checked entry when the menu opens.
  useEffect(() => {
    if (!open) return;
    const checked = levels.findIndex((l) => l.level === currentLevel);
    itemRefs.current[checked >= 0 ? checked : 0]?.focus();
  }, [open, levels, currentLevel]);

  // Close on a click/tap outside the menu.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (levels.length === 0) return null;

  const currentLabel = levels.find((l) => l.level === currentLevel)?.label ?? "Auto";

  function moveFocus(from: number, delta: number) {
    const next = (from + delta + levels.length) % levels.length;
    itemRefs.current[next]?.focus();
  }

  function select(level: number) {
    onSelect(level);
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
        {/* Minified inline sliders icon */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
        </svg>
        <span>Quality: {currentLabel}</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Playback quality"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
          className="absolute bottom-full left-0 z-20 mb-2 w-36 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          {levels.map((l, i) => (
            <button
              key={l.level}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={l.level === currentLevel}
              tabIndex={-1}
              onClick={() => select(l.level)}
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
                {l.level === currentLevel ? "✓" : ""}
              </span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
