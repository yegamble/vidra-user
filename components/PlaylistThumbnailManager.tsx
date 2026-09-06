"use client";

import { PlaylistCoverImage } from "@/components/PlaylistCoverImage";
import { useRef, useState } from "react";

import { ApiError, api, errorMessage } from "@/lib/api";

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


  return (
    <section
      aria-label="Playlist cover"
      className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4"
    >
      <p className="text-[15px] font-bold tracking-tight">Cover image</p>
      {shown ? (
        <PlaylistCoverImage
          playlistId={playlistId}
          version={version}
          alt="Current cover"
          className="aspect-video w-48 rounded-xl bg-surface-muted object-cover"
        />
      ) : (
        <p className="text-[13px] text-fg-muted">No cover yet.</p>
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
          className="focus-ring rounded-full text-sm text-fg-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-muted file:px-3.5 file:py-1.5 file:text-[13px] file:font-semibold file:text-fg file:transition-colors hover:file:bg-surface-strong disabled:opacity-60"
        />
        {shown ? (
          <button
            type="button"
            aria-label="Remove cover"
            disabled={busy}
            onClick={() => void remove()}
            className="focus-ring rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-danger-surface hover:text-danger disabled:opacity-60"
          >
            Remove
          </button>
        ) : null}
      </div>
      {busy ? <p className="text-[13px] text-fg-muted">Working…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
