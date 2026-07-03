"use client";

import { useState } from "react";

// Avatar renders a profile/channel image with an initial-letter fallback. The
// fallback block has the same dimensions (driven by the shared className), so
// layout stays stable whether the image exists or not; a broken image (e.g. the
// public serve URL 404s because none is set) swaps to the fallback via onError.
export function Avatar({
  src,
  name,
  alt = "",
  className = "h-8 w-8 text-sm",
}: {
  /** Image URL, or null to render the initial-letter fallback directly. */
  src: string | null;
  /** Name whose first character seeds the fallback block. */
  name: string;
  /**
   * Accessible name for the image. Leave "" (decorative) when the name is
   * already rendered alongside — screen readers then skip the image.
   */
  alt?: string;
  /** Size/typography overrides: height, width, and fallback text size. */
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  // A new src gets a fresh chance (e.g. after an upload replaced the image):
  // reset during render, the React-recommended prop-change adjustment pattern.
  if (prevSrc !== src) {
    setPrevSrc(src);
    setBroken(false);
  }

  if (!src || broken) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-zinc-200 font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 ${className}`}
      >
        {(name.trim()[0] ?? "?").toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- backend-served image, not a static asset
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      className={`inline-block shrink-0 rounded-full bg-zinc-100 object-cover dark:bg-zinc-800 ${className}`}
    />
  );
}
