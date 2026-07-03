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
      className="mt-2 flex flex-col overflow-hidden rounded-md border border-zinc-300 bg-white text-left hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
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
          <span className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {preview.title}
          </span>
        ) : null}
        {preview.description ? (
          <span className="line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
            {preview.description}
          </span>
        ) : null}
        <span className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-500">
          {hostOf(preview.url)}
        </span>
      </div>
    </a>
  );
}
