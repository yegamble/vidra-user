"use client";

import { useState } from "react";

import type { LinkPreview } from "@/lib/api";

// hostOf renders just the origin host of a URL for the card's source line;
// falls back to the raw URL if it doesn't parse.
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// LinkPreviewCard renders the OpenGraph preview the backend resolved for the
// first URL in a message: an optional thumbnail, the title, a truncated
// description, and the source host. The whole card is a safe external link
// (target=_blank + rel="noopener noreferrer nofollow ugc" — user-generated,
// untrusted). A broken preview image unmounts itself so the card stays tidy. A
// preview with no title/description/image at all is skipped (nothing to show
// beyond the link already in the body).
export function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  const [imageOk, setImageOk] = useState(true);
  const hasContent = Boolean(preview.title || preview.description || preview.image);
  if (!hasContent) return null;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      aria-label={`Open link: ${preview.title || preview.url}`}
      className="focus-ring mt-2 flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface text-left transition-colors hover:bg-surface-muted"
    >
      {preview.image && imageOk ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote OG thumbnail, unmounts on error
        <img
          src={preview.image}
          alt=""
          onError={() => setImageOk(false)}
          className="max-h-40 w-full object-cover"
        />
      ) : null}
      <div className="flex flex-col gap-0.5 px-3 py-2">
        {preview.title ? (
          <span className="line-clamp-2 text-sm font-semibold text-fg">{preview.title}</span>
        ) : null}
        {preview.description ? (
          <span className="line-clamp-2 text-xs text-fg-muted">{preview.description}</span>
        ) : null}
        <span className="mt-0.5 truncate text-xs text-fg-muted">{hostOf(preview.url)}</span>
      </div>
    </a>
  );
}
