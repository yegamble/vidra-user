"use client";

import { useRef, useState } from "react";

import { ApiError, api, errorMessage, playlistThumbnailUrl } from "@/lib/api";

// PlaylistThumbnailManager lets a playlist's owner upload/replace or remove its
// cover image, on the playlist detail page. Mirrors ThumbnailManager: a
// cache-busted preview of the current cover (16:9) or a "no cover" note, a
// JPEG/PNG/WebP picker, and a Remove control; a 415 maps to a friendly type
// message and a remove-404 is treated as already-gone. Owner-only surface.
export function PlaylistThumbnailManager({
  playlistId,
  hasThumbnail,
  onChanged,
}: {
  playlistId: string;
  hasThumbnail: boolean;
  /** Called after a successful upload/remove so the parent can refresh has_thumbnail. */
  onChanged?: (has: boolean) => void;
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
      await api.setPlaylistThumbnail(playlistId, file);
      setShown(true);
      setVersion((v) => v + 1);
      onChanged?.(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 415) {
        setError("The image must be a JPEG, PNG, or WebP.");
      } else {
        setError(errorMessage(err, "Could not set the cover image."));
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deletePlaylistThumbnail(playlistId);
      setShown(false);
      onChanged?.(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Already gone server-side — reflect that instead of erroring.
        setShown(false);
        onChanged?.(false);
      } else {
        setError(errorMessage(err, "Could not remove the cover image."));
      }
    } finally {
      setBusy(false);
    }
  }

  const src = shown ? `${playlistThumbnailUrl(playlistId)}?v=${version}` : null;

  return (
    <section
      aria-label="Playlist cover"
      className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <p className="text-sm font-medium">Cover image</p>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- backend-served cover, not a static asset
        <img
          src={src}
          alt="Current cover"
          className="aspect-video w-48 rounded bg-zinc-100 object-cover dark:bg-zinc-800"
        />
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">No cover yet.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          aria-label="Cover image"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          className="text-sm"
        />
        {shown ? (
          <button
            type="button"
            aria-label="Remove cover"
            disabled={busy}
            onClick={() => void remove()}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-red-400"
          >
            Remove
          </button>
        ) : null}
      </div>
      {busy ? <p className="text-xs text-zinc-500 dark:text-zinc-400">Working…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </section>
  );
}
