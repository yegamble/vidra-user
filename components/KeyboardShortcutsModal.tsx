"use client";

import { Modal } from "@/components/ui/Modal";
import { createPortal } from "react-dom";

const groups = [
  {
    title: "Site navigation",
    shortcuts: [
      ["Focus search", "/"], ["Go home", "g then h"], ["Open Studio", "g then s"],
      ["Open your profile", "g then p"], ["Open library", "g then l"], ["Show this dialog", "?"],
    ],
  },
  {
    title: "Playback",
    shortcuts: [
      ["Play or pause", "k / Space"], ["Rewind 10 seconds", "j"], ["Forward 10 seconds", "l"],
      ["Seek 5 seconds", "← / →"], ["Seek to 0–90%", "0–9"], ["Start / end", "Home / End"],
      ["Previous / next frame (paused)", ", / ."], ["Decrease / increase speed", "< / >"],
    ],
  },
  {
    title: "Player",
    shortcuts: [
      ["Mute", "m"], ["Captions", "c"], ["Full screen", "f"], ["Theater mode", "t"],
      ["Picture in picture", "i"], ["Volume (player focused)", "↑ / ↓"],
    ],
  },
] as const;

export function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <Modal title="Keyboard shortcuts" onClose={onClose} className="!max-w-4xl">
      <div className="grid max-h-[70vh] gap-7 overflow-y-auto pr-1 sm:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-fg-muted">{group.title}</h3>
            <dl className="divide-y divide-border-subtle border-y border-border-subtle">
              {group.shortcuts.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-sm text-fg-muted">{label}</dt>
                  <dd><kbd className="rounded-md border border-border bg-surface-muted px-2 py-1 font-mono text-xs font-semibold text-fg">{keys}</kbd></dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>,
    document.body,
  );
}
