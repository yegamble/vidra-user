"use client";

import { useRef, useState } from "react";

import { ApiError, api, errorMessage, videoThumbnailUrl } from "@/lib/api";

// ThumbnailManager lets the owner upload/replace a video's poster image. Embedded
// in the studio's per-video edit surface. It shows the current poster (if any) and
// a file picker; on a successful upload it cache-busts the preview so the new
// image shows immediately.
export function ThumbnailManager({
  videoId,
  hasThumbnail,
}: {
  videoId: string;
  hasThumbnail: boolean;
}) {
  const [version, setVersion] = useState(0); // bumped to bust the <img> cache
  const [shown, setShown] = useState(hasThumbnail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      await api.setVideoThumbnail(videoId, file);
      setShown(true);
      setVersion((v) => v + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 415) {
        setError("The image must be a JPEG, PNG, or WebP.");
      } else {
        setError(errorMessage(err, "Could not set the thumbnail."));
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const src = shown ? `${videoThumbnailUrl(videoId)}?v=${version}` : null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface p-4">
      <p className="text-sm font-semibold">Thumbnail</p>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- backend-served poster, not a static asset
        <img
          src={src}
          alt="Current thumbnail"
          className="aspect-video w-40 rounded-lg bg-surface-muted object-cover"
        />
      ) : (
        <p className="text-xs text-fg-muted">No thumbnail yet.</p>
      )}
      <input
        ref={fileRef}
        type="file"
        aria-label="Thumbnail image"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
        className="text-sm focus-ring disabled:opacity-60 file:mr-3 file:rounded-full file:border-0 file:bg-surface-muted file:px-3.5 file:py-1.5 file:text-sm file:font-semibold file:text-fg"
      />
      {busy ? <p className="text-xs text-fg-muted">Uploading…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
