"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { UploadIcon, VideoIcon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";

// CreateSheet — the phone "Create" bottom sheet (design "Vidra App": the Create
// tab opens a sheet, it does not navigate). Three entry points into the creator
// surfaces that exist today: Upload a video and Go live both live on /studio
// (the upload + live sections), so they deep-link to those anchors; Open Studio
// is the dashboard itself. Built on the shared Modal `sheet` skin (grab handle,
// rounded top, safe-area footer, backdrop + Escape to dismiss) so it inherits
// the focus trap and the "restore focus to the Create button on close" contract.
type CreateRow = {
  href: string;
  title: string;
  subtitle: string;
  /** 18px glyph, or the Go-live status dot. */
  icon: ReactNode;
};

const ROWS: readonly CreateRow[] = [
  {
    href: "/studio#upload",
    title: "Upload a video",
    subtitle: "Resumable, up to 8 GB",
    icon: <UploadIcon size={18} />,
  },
  {
    href: "/studio#go-live",
    title: "Go live",
    subtitle: "Stream via RTMP with optional replay",
    // The design uses a red status dot (not a glyph) for Go live.
    icon: <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-danger-solid" />,
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
          <li key={row.href}>
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
