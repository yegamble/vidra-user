"use client";

import { useRef, useState } from "react";

// The documented shortcut set — keep in sync with lib/player-shortcuts.ts.
const SHORTCUTS: Array<[keys: string, action: string]> = [
  ["Space / K", "Play or pause"],
  ["J / L", "Back / forward 10 seconds"],
  ["← / →", "Back / forward 5 seconds"],
  ["M", "Mute or unmute"],
  ["F", "Fullscreen"],
  ["C", "Toggle captions"],
];

// KeyboardShortcutsHelp documents the player's keyboard shortcuts behind an
// accessible disclosure: a "Keyboard shortcuts" button (aria-expanded/
// aria-controls) toggling an inline definition list. Escape inside the panel
// closes it and returns focus to the button. Shortcuts are ignored while the
// panel's button has focus (it's a button — the global handler skips
// interactive targets), so the panel itself never fights the player.
export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="player-shortcuts-help"
        onClick={() => setOpen((o) => !o)}
        className="focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-muted px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong"
      >
        {/* Minified inline command-key icon */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
        </svg>
        <span>Keyboard shortcuts</span>
      </button>
      {open ? (
        <div
          id="player-shortcuts-help"
          role="region"
          aria-label="Keyboard shortcuts"
          className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border border-border-subtle bg-surface-raised p-3 shadow-lg"
        >
          <dl className="flex flex-col gap-1.5 text-sm">
            {SHORTCUTS.map(([keys, action]) => (
              <div key={keys} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 font-semibold text-fg">{keys}</dt>
                <dd className="text-right text-fg-muted">{action}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-fg-muted">
            Shortcuts pause while you are typing in a field.
          </p>
        </div>
      ) : null}
    </div>
  );
}
