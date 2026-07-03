"use client";

import { useEffect, useRef, useState } from "react";

import { formatDuration } from "@/lib/format";

const PILL =
  "flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";

const COPY_BUTTON =
  "shrink-0 rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";

const FIELD =
  "min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

// Minified Feather-style "share" icon.
function ShareIcon() {
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
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

// escapeAttr makes a title safe inside the embed snippet's HTML attribute.
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ShareButton opens an accessible share dialog for the watch page: the copyable
// watch-page URL (optionally with a ?t=<seconds> start position taken from the
// player's current time — the watch page and embed player honor it on load),
// plus a copyable <iframe> embed snippet. Sharing is public — no auth gate.
export function ShareButton({
  videoId,
  title,
  getCurrentTime,
}: {
  videoId: string;
  title: string;
  /** Reads the player's current position in seconds (for "Start at"). */
  getCurrentTime?: () => number;
}) {
  const [open, setOpen] = useState(false);
  const [atSeconds, setAtSeconds] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Snapshot the playback position at open so the dialog is stable.
          const t = Math.floor(getCurrentTime?.() ?? 0);
          setAtSeconds(Number.isFinite(t) && t > 0 ? t : 0);
          setOpen(true);
        }}
        className={PILL}
      >
        <ShareIcon />
        <span>Share</span>
      </button>
      {open ? (
        <ShareDialog
          videoId={videoId}
          title={title}
          atSeconds={atSeconds}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ShareDialog({
  videoId,
  title,
  atSeconds,
  onClose,
}: {
  videoId: string;
  title: string;
  atSeconds: number;
  onClose: () => void;
}) {
  const [startAtChecked, setStartAtChecked] = useState(false);
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  // Focus the link field on open and close on Escape (ReportButton pattern).
  useEffect(() => {
    linkRef.current?.focus();
    linkRef.current?.select();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The dialog only mounts client-side (after a click), so window is available.
  const origin = window.location.origin;
  const startQuery = startAtChecked && atSeconds > 0 ? `?t=${atSeconds}` : "";
  const watchUrl = `${origin}/videos/${videoId}${startQuery}`;
  const embedSnippet = `<iframe src="${origin}/embed/${videoId}${startQuery}" width="560" height="315" frameborder="0" allowfullscreen title="${escapeAttr(title)}"></iframe>`;

  async function copy(target: "link" | "embed", text: string) {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the
      // fields stay selectable for a manual copy.
      setCopied(null);
      setCopyFailed(true);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share this video"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold tracking-tight">Share this video</h2>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={linkRef}
              readOnly
              value={watchUrl}
              aria-label="Watch page link"
              onFocus={(e) => e.currentTarget.select()}
              className={FIELD}
            />
            <button
              type="button"
              aria-label="Copy watch page link"
              onClick={() => void copy("link", watchUrl)}
              className={COPY_BUTTON}
            >
              {copied === "link" ? "Copied" : "Copy"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={startAtChecked}
              disabled={atSeconds === 0}
              onChange={(e) => {
                setStartAtChecked(e.target.checked);
                setCopied(null); // the URLs changed; "Copied" no longer holds
              }}
              className="h-4 w-4 rounded border-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700"
            />
            <span>Start at {formatDuration(atSeconds)}</span>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Embed</span>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={embedSnippet}
              aria-label="Embed code"
              onFocus={(e) => e.currentTarget.select()}
              className={FIELD}
            />
            <button
              type="button"
              aria-label="Copy embed code"
              onClick={() => void copy("embed", embedSnippet)}
              className={COPY_BUTTON}
            >
              {copied === "embed" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {copyFailed ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t copy automatically — select the text and copy it manually.
          </p>
        ) : null}

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
