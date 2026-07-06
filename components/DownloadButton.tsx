"use client";

import { useState } from "react";

import { Modal } from "@/components/ui";
import { videoOriginalUrl } from "@/lib/api";

const PILL =
  "focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-muted px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong";

// Minified Feather-style "download" icon.
function DownloadIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

// DownloadButton opens a small accessible dialog listing the video's
// downloadable files. The contract currently exposes only the original stream
// (GET /videos/{id}/original) — no dedicated download endpoint with a
// Content-Disposition header and no size/type metadata on the detail response
// (backend dependency recorded in .ralph/fix_plan.md). The `download`
// attribute is a same-origin hint; cross-origin the browser streams/plays the
// file instead, which is still a usable "save as" target.
export function DownloadButton({ videoId }: { videoId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={PILL}>
        <DownloadIcon />
        <span>Download</span>
      </button>
      {open ? <DownloadDialog videoId={videoId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DownloadDialog({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  // Modal handles focus trap + restore, Escape, and backdrop close.
  return (
    <Modal title="Download this video" onClose={onClose}>
      <ul className="flex flex-col gap-2">
        <li className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-3.5 py-2.5">
          <div className="flex min-w-0 flex-col">
            <a
              href={videoOriginalUrl(videoId)}
              download
              className="focus-ring truncate rounded text-sm font-semibold text-fg underline-offset-2 hover:underline"
            >
              Original file
            </a>
            <span className="text-xs text-fg-muted">
              The file as originally uploaded.
            </span>
          </div>
          <span aria-hidden className="text-fg-muted">
            <DownloadIcon />
          </span>
        </li>
      </ul>
    </Modal>
  );
}
