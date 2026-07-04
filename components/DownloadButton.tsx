"use client";

import { useState } from "react";

import { Modal } from "@/components/ui";
import { videoOriginalUrl } from "@/lib/api";

const PILL =
  "flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";

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
        <li className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <div className="flex min-w-0 flex-col">
            <a
              href={videoOriginalUrl(videoId)}
              download
              className="truncate text-sm font-medium text-zinc-900 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-100"
            >
              Original file
            </a>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              The file as originally uploaded.
            </span>
          </div>
          <DownloadIcon />
        </li>
      </ul>
    </Modal>
  );
}
