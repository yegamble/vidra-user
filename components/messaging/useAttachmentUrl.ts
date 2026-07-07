"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

export type AttachmentUrlState = "loading" | "ready" | "error";

// useAttachmentUrl fetches a participant-gated DM attachment's bytes (an <img
// src> can't carry the bearer token) and exposes them as an object URL, revoked
// on unmount / id change. Shared by the inline single image, the media grid
// cells, and the lightbox so the auth-fetch + revoke logic lives in one place.
export function useAttachmentUrl(id: string): { url: string | null; state: AttachmentUrlState } {
  const [state, setState] = useState<AttachmentUrlState>("loading");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    api
      .fetchAttachment(id, controller.signal)
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
  }, [id]);

  return { url, state };
}
