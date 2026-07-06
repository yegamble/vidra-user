"use client";

import { useRef, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { ApiError, errorMessage } from "@/lib/api";

// ProfileImageManager is the shared avatar/banner upload surface (account
// settings + the studio channel rows), mirroring ThumbnailManager: it shows the
// current image — an initial-letter fallback for avatars, a "none yet" note for
// banners — plus a JPEG/PNG/WebP picker and a Remove control. A successful
// upload cache-busts the preview so the replacement shows immediately; a 415
// maps to a friendly type message. Owner-only: it is only ever rendered on
// surfaces the caller already owns (settings / own channel rows).
export function ProfileImageManager({
  kind,
  label,
  name,
  has,
  src,
  upload,
  remove,
  onChanged,
}: {
  kind: "avatar" | "banner";
  /** Section label, e.g. "Avatar" / "Channel banner" — seeds the control names. */
  label: string;
  /** Name whose initial seeds the avatar fallback (unused for banners). */
  name: string;
  /** Whether an image is currently set (from has_avatar / has_banner). */
  has: boolean;
  /** The public serve URL of the current image (cache-busted for previews). */
  src: string;
  upload: (file: File) => Promise<unknown>;
  remove: () => Promise<void>;
  /** Called after a successful upload/remove (e.g. to refresh session state). */
  onChanged?: (has: boolean) => void;
}) {
  const [version, setVersion] = useState(0); // bumped to bust the <img> cache
  const [shown, setShown] = useState(has);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lowerLabel = label.toLowerCase();

  async function doUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      await upload(file);
      setShown(true);
      setVersion((v) => v + 1);
      onChanged?.(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 415) {
        setError("The image must be a JPEG, PNG, or WebP.");
      } else {
        setError(errorMessage(err, `Could not set the ${kind}.`));
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function doRemove() {
    setBusy(true);
    setError(null);
    try {
      await remove();
      setShown(false);
      onChanged?.(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Already gone server-side — reflect that instead of erroring.
        setShown(false);
        onChanged?.(false);
      } else {
        setError(errorMessage(err, `Could not remove the ${kind}.`));
      }
    } finally {
      setBusy(false);
    }
  }

  const url = shown ? `${src}?v=${version}` : null;

  return (
    <section
      aria-label={label}
      className="flex flex-col gap-2.5 rounded-2xl border border-border-subtle bg-surface p-4"
    >
      <p className="text-sm font-semibold text-fg">{label}</p>
      {kind === "avatar" ? (
        <Avatar src={url} name={name} alt={url ? `Current ${lowerLabel}` : ""} className="h-16 w-16 text-xl" />
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element -- backend-served image, not a static asset
        <img
          src={url}
          alt={`Current ${lowerLabel}`}
          className="aspect-[4/1] w-full max-w-md rounded-xl bg-surface-muted object-cover"
        />
      ) : (
        <p className="text-xs text-fg-muted">No banner yet.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          aria-label={`${label} image`}
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doUpload(f);
          }}
          className="focus-ring rounded-sm text-sm text-fg-muted file:mr-3 file:rounded-full file:border file:border-border file:bg-surface file:px-3.5 file:py-1.5 file:text-[13px] file:font-semibold file:text-fg hover:file:bg-surface-muted disabled:opacity-60"
        />
        {shown ? (
          <button
            type="button"
            aria-label={`Remove ${lowerLabel}`}
            disabled={busy}
            onClick={() => void doRemove()}
            className="focus-ring rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-fg-muted transition-colors hover:text-danger disabled:opacity-60"
          >
            Remove
          </button>
        ) : null}
      </div>
      {busy ? <p className="text-xs text-fg-muted">Working…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
