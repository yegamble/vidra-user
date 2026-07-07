"use client";

import { useState } from "react";

import { api } from "@/lib/api";
import type { DMAttachment, DMAttachmentKind } from "@/lib/api";
import { formatBytes } from "@/lib/format";

// A minified Feather-style glyph per attachment kind (24x24 stroke grid).
const KIND_ICON: Record<DMAttachmentKind, string> = {
  image: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
  video: "M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z",
  audio: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  pdf: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  // Office document (application/msword and the OOXML/legacy Word/PowerPoint/Excel
  // types) — a file glyph with text lines, distinct from the bare-page pdf icon.
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
};

type State = "idle" | "downloading" | "error";

// AttachmentDownloadRow renders a non-image (or failed-to-preview) attachment as
// a download row: a kind icon, the filename, and its size, with a Download
// button. The bytes are participant-gated behind auth, so the button fetches the
// Blob with the bearer token and hands it to the browser as a same-name download
// (object URL + anchor), rather than a plain link that would 401.
export function AttachmentDownloadRow({ attachment }: { attachment: DMAttachment }) {
  const [state, setState] = useState<State>("idle");

  async function download() {
    if (state === "downloading") return;
    setState("downloading");
    try {
      const blob = await api.fetchAttachment(attachment.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5 rounded-xl border border-border-subtle bg-surface px-3 py-2">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 shrink-0 text-fg-muted"
        >
          <path d={KIND_ICON[attachment.kind]} />
        </svg>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-fg">{attachment.filename}</span>
          <span className="text-xs tabular-nums text-fg-muted">
            {formatBytes(attachment.size_bytes)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void download()}
          disabled={state === "downloading"}
          aria-label={`Download ${attachment.filename}`}
          className="focus-ring shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
        >
          {state === "downloading" ? "Downloading…" : "Download"}
        </button>
      </div>
      {state === "error" ? (
        <p className="text-xs text-danger">Could not download this file.</p>
      ) : null}
    </div>
  );
}
