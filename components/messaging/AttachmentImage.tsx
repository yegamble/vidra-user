"use client";

import { AttachmentDownloadRow } from "./AttachmentDownloadRow";
import { useAttachmentUrl } from "./useAttachmentUrl";
import type { DMAttachment } from "@/lib/api";

// AttachmentImage renders a single inline image attachment, bounded so it never
// blows out a message bubble. The bytes are participant-gated behind auth, so
// the object URL comes from useAttachmentUrl (auth-fetched Blob, revoked on
// unmount). A failed fetch degrades to the same download row a non-image
// attachment uses, so the attachment is always reachable. When `onOpen` is
// given the image becomes a button that opens the lightbox.
export function AttachmentImage({
  attachment,
  onOpen,
}: {
  attachment: DMAttachment;
  onOpen?: () => void;
}) {
  const { url, state } = useAttachmentUrl(attachment.id);

  if (state === "error") {
    return <AttachmentDownloadRow attachment={attachment} />;
  }

  if (state === "loading" || !url) {
    return (
      <div
        className="flex h-40 w-56 max-w-full animate-pulse items-center justify-center rounded-2xl bg-surface-strong text-xs text-fg-muted"
        aria-label={`Loading image ${attachment.filename}`}
      >
        Loading image…
      </div>
    );
  }

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- object-URL blob, not a static asset
    <img
      src={url}
      alt={attachment.filename}
      className="max-h-[320px] max-w-full rounded-2xl object-contain"
    />
  );

  if (!onOpen) return img;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View image ${attachment.filename}`}
      className="focus-ring block max-w-full overflow-hidden rounded-2xl"
    >
      {img}
    </button>
  );
}
