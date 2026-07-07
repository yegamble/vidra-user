"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import type { DMAttachment } from "@/lib/api";

import { AttachmentImage } from "./AttachmentImage";
import { MessageLightbox } from "./MessageLightbox";
import { useAttachmentUrl } from "./useAttachmentUrl";

// A grid cell: an auth-fetched image thumbnail that opens the lightbox. A failed
// fetch degrades to a muted tile (still labelled with the filename) rather than a
// broken image, keeping the grid mask intact.
function MediaCell({
  attachment,
  onOpen,
  className,
  overlay,
}: {
  attachment: DMAttachment;
  onOpen: () => void;
  className?: string;
  overlay?: string;
}) {
  const { url, state } = useAttachmentUrl(attachment.id);

  if (state === "error") {
    return (
      <div
        className={cn(
          "flex aspect-square items-center justify-center bg-surface-strong text-[11px] text-fg-muted",
          className,
        )}
        aria-label={`Image unavailable: ${attachment.filename}`}
      >
        Unavailable
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={overlay ? `View all images` : `View image ${attachment.filename}`}
      className={cn("focus-ring relative block aspect-square overflow-hidden", className)}
    >
      {state === "loading" || !url ? (
        <span className="block h-full w-full animate-pulse bg-surface-strong" aria-hidden />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- object-URL blob, not a static asset
        <img src={url} alt={attachment.filename} className="h-full w-full object-cover" />
      )}
      {overlay ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-white">
          {overlay}
        </span>
      ) : null}
    </button>
  );
}

// MessageMedia renders a message's image attachments (bubble-less): a single
// bounded image, or a 2–4 image grid inside one rounded-2xl mask (3 → first cell
// spans both columns), or the first four of a larger set with a "+N" overlay on
// the fourth that opens the paged lightbox. Non-image attachments are handled by
// MessageAttachments (download rows).
export function MessageMedia({ images }: { images: DMAttachment[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  if (images.length === 0) return null;

  const open = (i: number) => setLightbox(i);

  let body: React.ReactNode;
  if (images.length === 1) {
    body = <AttachmentImage attachment={images[0]} onOpen={() => open(0)} />;
  } else {
    const shown = images.slice(0, 4);
    const extra = images.length - 4;
    body = (
      <div className="grid max-w-[320px] grid-cols-2 gap-0.5 overflow-hidden rounded-2xl">
        {shown.map((a, i) => (
          <MediaCell
            key={a.id}
            attachment={a}
            onOpen={() => open(i === 3 && extra > 0 ? 3 : i)}
            className={images.length === 3 && i === 0 ? "col-span-2" : undefined}
            overlay={i === 3 && extra > 0 ? `+${extra}` : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      {body}
      {lightbox !== null ? (
        <MessageLightbox
          images={images}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </>
  );
}
