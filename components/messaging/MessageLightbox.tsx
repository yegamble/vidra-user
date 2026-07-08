"use client";

import { useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { DMAttachment } from "@/lib/api";
import { formatBytes } from "@/lib/format";

import { useAttachmentUrl } from "./useAttachmentUrl";

// LightboxImage fetches + renders the shown image at natural size, capped to the
// viewport. The bytes are the same participant-gated blob the grid cell fetched;
// re-fetching here keeps the lightbox self-contained (the object URL is small).
function LightboxImage({ attachment }: { attachment: DMAttachment }) {
  const { url, state } = useAttachmentUrl(attachment.id);
  if (state === "loading" || !url) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label={`Loading ${attachment.filename}`} />
      </div>
    );
  }
  if (state === "error") {
    return <p className="py-16 text-center text-sm text-fg-muted">Could not load this image.</p>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- object-URL blob, not a static asset
    <img
      src={url}
      alt={attachment.filename}
      className="mx-auto max-h-[85dvh] max-w-full rounded-xl object-contain"
    />
  );
}

// MessageLightbox is a full-size viewer for a message's images, built on the
// Modal a11y contract (focus trap/restore, Escape, scrim). It pages through the
// message's full image set (Messenger/Telegram album pattern) and offers a
// Download of the current image (the auth-gated blob saved via an object URL —
// a plain link would 401).
export function MessageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: DMAttachment[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const current = images[index];
  const many = images.length > 1;

  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await api.fetchAttachment(current.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = current.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal title={current.filename} onClose={onClose} className="max-w-3xl">
      <div className="flex flex-col gap-3">
        <div className="relative flex items-center justify-center">
          {many ? (
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => onIndexChange((index - 1 + images.length) % images.length)}
              className="focus-ring absolute left-0 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-fg shadow-md transition-colors hover:bg-surface-muted"
            >
              <ChevronLeftIcon size={20} strokeWidth={2} />
            </button>
          ) : null}
          <LightboxImage key={current.id} attachment={current} />
          {many ? (
            <button
              type="button"
              aria-label="Next image"
              onClick={() => onIndexChange((index + 1) % images.length)}
              className="focus-ring absolute right-0 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-fg shadow-md transition-colors hover:bg-surface-muted"
            >
              <ChevronRightIcon size={20} strokeWidth={2} />
            </button>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[13px] text-fg-muted">
            {current.filename} · {formatBytes(current.size_bytes)}
            {many ? ` · ${index + 1} of ${images.length}` : ""}
          </span>
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading}
            className="focus-ring shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
          >
            {downloading ? "Downloading…" : "Download"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
