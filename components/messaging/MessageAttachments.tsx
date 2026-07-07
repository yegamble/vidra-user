"use client";

import type { DMAttachment } from "@/lib/api";

import { AttachmentDownloadRow } from "./AttachmentDownloadRow";
import { MessageMedia } from "./MessageMedia";

// MessageAttachments renders a message's attachments: images as a bubble-less
// media grid (MessageMedia — single, 2–4 grid, or a "+N" album) and every other
// kind (video/audio/pdf) as a download row. Both fetch their bytes
// participant-gated behind auth. Empty/absent → nothing.
export function MessageAttachments({ attachments }: { attachments?: DMAttachment[] }) {
  if (!attachments || attachments.length === 0) return null;
  const images = attachments.filter((a) => a.kind === "image");
  const files = attachments.filter((a) => a.kind !== "image");
  return (
    <div className="mt-2 flex flex-col gap-2">
      {images.length > 0 ? <MessageMedia images={images} /> : null}
      {files.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {files.map((a) => (
            <li key={a.id}>
              <AttachmentDownloadRow attachment={a} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
