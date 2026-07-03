"use client";

import type { DMAttachment } from "@/lib/api";

import { AttachmentDownloadRow } from "./AttachmentDownloadRow";
import { AttachmentImage } from "./AttachmentImage";

// MessageAttachments renders a message's attachments: images inline (bounded)
// and every other kind (video/audio/pdf) as a download row. Both fetch their
// bytes participant-gated behind auth. Empty/absent → nothing.
export function MessageAttachments({ attachments }: { attachments?: DMAttachment[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {attachments.map((a) => (
        <li key={a.id}>
          {a.kind === "image" ? (
            <AttachmentImage attachment={a} />
          ) : (
            <AttachmentDownloadRow attachment={a} />
          )}
        </li>
      ))}
    </ul>
  );
}
