"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useT } from "@/components/I18nProvider";
import { PlusSquareIcon, UploadIcon, VideoIcon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import type { PlainMessageKey } from "@/lib/i18n";
import { useLiveAvailable } from "@/lib/live/availability";

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
  title: PlainMessageKey;
  subtitle: PlainMessageKey;
  /** 18px glyph, or the Go-live status dot. */
  icon: ReactNode;
  /** Render a divider above this row (grouping the primary flows from the rest). */
  divider?: boolean;
};

// `live: true` marks the row that is dropped when the instance reports
// `features.live: false` (the setting AND the RTMP ingest capability) — a row
// that can only ever answer 403/503 is worse than no row.
const ROWS: readonly (CreateRow & { live?: true })[] = [
  {
    href: "/studio/content?upload=1",
    title: "header.uploadVideo",
    subtitle: "create.upload.subtitle",
    icon: <UploadIcon size={18} className="text-accent-text" />,
  },
  {
    href: "/studio/live?new=1",
    live: true,
    title: "header.goLive",
    subtitle: "create.live.subtitle",
    // A `live`-token status dot (not a glyph), matching the design's Go-live cue.
    icon: <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-live" />,
  },
  {
    href: "/studio/channel?create=1",
    title: "header.newChannel",
    subtitle: "create.channel.subtitle",
    icon: <PlusSquareIcon size={18} />,
    divider: true,
  },
  {
    href: "/studio",
    title: "create.studio.title",
    subtitle: "create.studio.subtitle",
    icon: <VideoIcon size={18} />,
  },
];

export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const liveAvailable = useLiveAvailable();
  if (!open) return null;
  return (
    <Modal title={t("header.create")} variant="sheet" hideClose onClose={onClose}>
      <ul className="flex flex-col">
        {ROWS.filter((row) => liveAvailable || row.live !== true).map((row) => (
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
                <span className="block text-[15px] font-semibold">{t(row.title)}</span>
                <span className="block text-[12.5px] text-fg-muted">{t(row.subtitle)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
