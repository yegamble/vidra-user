"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { PlusSquareIcon, UploadIcon, VideoIcon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";

// CreateSheet — the phone "Create" bottom sheet (design "Vidra App": the Create
// tab opens a sheet, it does not navigate). It mirrors the desktop "+ Create"
// header dropdown: the two primary creator flows (Upload video / Go live)
// deep-link into the studio surface that auto-opens them, then a divider, then
// New channel and the Studio entry itself. Built on the shared Modal `sheet`
// skin (grab handle, rounded top, safe-area footer, backdrop + Escape to
// dismiss) so it inherits the focus trap and the "restore focus to the Create
// button on close" contract.
type CreateRow = {
  href: string;
  title: string;
  subtitle: string;
  /** 18px glyph, or the Go-live status dot. */
  icon: ReactNode;
  /** Render a divider above this row (grouping the primary flows from the rest). */
  divider?: boolean;
};

const ROWS: readonly CreateRow[] = [
  {
    href: "/studio/content?upload=1",
    title: "Upload video",
    subtitle: "Resumable, up to 8 GB",
    icon: <UploadIcon size={18} className="text-accent-text" />,
  },
  {
    href: "/studio/live?new=1",
    title: "Go live",
    subtitle: "Stream via RTMP with optional replay",
    // A `live`-token status dot (not a glyph), matching the design's Go-live cue.
    icon: <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-live" />,
  },
  {
    href: "/studio/channel?create=1",
    title: "New channel",
    subtitle: "Start a new channel for your videos",
    icon: <PlusSquareIcon size={18} />,
    divider: true,
  },
  {
    href: "/studio",
    title: "Open Studio",
    subtitle: "Manage videos, streams and captions",
    icon: <VideoIcon size={18} />,
  },
];

export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Modal title="Create" variant="sheet" hideClose onClose={onClose}>
      <ul className="flex flex-col">
        {ROWS.map((row) => (
          <li key={row.href} className={row.divider ? "mt-1 border-t border-border-subtle pt-1" : undefined}>
            <Link
              href={row.href}
              onClick={onClose}
              className="focus-ring flex items-center gap-3.5 rounded-xl py-3 text-fg"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted">
                {row.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{row.title}</span>
                <span className="block text-[12.5px] text-fg-muted">{row.subtitle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
