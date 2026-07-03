"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { DMAttachment } from "@/lib/api";

import { AttachmentDownloadRow } from "./AttachmentDownloadRow";

type State = "loading" | "ready" | "error";

// AttachmentImage renders an inline image attachment, bounded so it never blows
// out a message bubble. The bytes are participant-gated behind auth (an <img
// src> can't carry the bearer token), so we fetch the Blob and render it via an
// object URL, revoking it on unmount / id change to avoid leaks. A failed fetch
// degrades to the same download row a non-image attachment uses, so the
// attachment is always reachable.
export function AttachmentImage({ attachment }: { attachment: DMAttachment }) {
  const [state, setState] = useState<State>("loading");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // The component is keyed by attachment.id in the list, so it mounts fresh
    // per attachment — the effect runs once and needs no synchronous reset of
    // the loading/url state (which would trigger a cascading render).
    const controller = new AbortController();
    let objectUrl: string | null = null;
    api
      .fetchAttachment(attachment.id, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (state === "error") {
    return <AttachmentDownloadRow attachment={attachment} />;
  }

  if (state === "loading" || !url) {
    return (
      <div
        className="flex h-40 w-56 max-w-full animate-pulse items-center justify-center rounded-md bg-zinc-200 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
        aria-label={`Loading image ${attachment.filename}`}
      >
        Loading image…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- object-URL blob, not a static asset
    <img
      src={url}
      alt={attachment.filename}
      className="max-h-64 max-w-full rounded-md object-contain"
    />
  );
}
