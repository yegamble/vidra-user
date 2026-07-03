"use client";

import { useEffect, useRef, useState } from "react";

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
  const linkRef = useRef<HTMLAnchorElement>(null);

  // Focus the file link on open and close on Escape (ReportButton pattern).
  useEffect(() => {
    linkRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Download this video"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold tracking-tight">Download this video</h2>

        <ul className="flex flex-col gap-2">
          <li className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <div className="flex min-w-0 flex-col">
              <a
                ref={linkRef}
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

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
