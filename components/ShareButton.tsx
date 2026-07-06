"use client";

import { useState } from "react";

import { Modal } from "@/components/ui";
import { formatDuration } from "@/lib/format";

const PILL =
  "focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-muted px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong";

const COPY_BUTTON =
  "focus-ring shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-muted";

const FIELD =
  "focus-ring min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-fg";

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
    <Modal title="Share this video" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
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
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={startAtChecked}
              disabled={atSeconds === 0}
              onChange={(e) => {
                setStartAtChecked(e.target.checked);
                setCopied(null); // the URLs changed; "Copied" no longer holds
              }}
              className="focus-ring h-4 w-4 rounded border-border"
            />
            <span className="tabular-nums">Start at {formatDuration(atSeconds)}</span>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">Embed</span>
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
          <p className="text-sm text-danger">
            Couldn&apos;t copy automatically — select the text and copy it manually.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
