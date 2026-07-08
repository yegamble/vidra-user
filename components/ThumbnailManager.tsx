"use client";

import { useEffect, useRef, useState } from "react";

import { VideoIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import {
  ApiError,
  api,
  errorMessage,
  videoOriginalUrl,
  videoStoryboardImageUrl,
  videoStoryboardVttUrl,
  videoThumbnailUrl,
} from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { canFramePick, clampFrameTime, frameThumbnailError } from "@/lib/frame-pick";
import { cueAt, parseStoryboardVtt, type StoryboardCue } from "@/lib/storyboard";

// ThumbnailManager lets the owner set a video's poster image, two ways that live
// in the same card (design token recipes only):
//   1. Upload an image  — a creator-supplied JPEG/PNG/WebP (multipart).
//   2. Pick from video  — scrub the processed original and grab an exact frame,
//      extracted server-side (UPLOAD-04). Preview seeks the W1 storyboard sprite
//      when the video has one, else a muted <video>.
// On a successful set it cache-busts the preview so the new poster shows at once.
export function ThumbnailManager({
  videoId,
  hasThumbnail,
  hasStoryboard = false,
  durationSeconds,
}: {
  videoId: string;
  hasThumbnail: boolean;
  /** Whether a seek-preview storyboard exists (drives the scrubber preview source). */
  hasStoryboard?: boolean;
  /** Probed duration; only a known positive value enables frame-pick. */
  durationSeconds?: number;
}) {
  const [version, setVersion] = useState(0); // bumped to bust the <img> cache
  const [shown, setShown] = useState(hasThumbnail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      await api.setVideoThumbnail(videoId, file);
      setShown(true);
      setPicking(false);
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

  async function applyFrame(atSeconds: number) {
    setBusy(true);
    setError(null);
    try {
      await api.setVideoThumbnailFrame(videoId, clampFrameTime(atSeconds, durationSeconds));
      setShown(true);
      setPicking(false);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(frameThumbnailError(err));
    } finally {
      setBusy(false);
    }
  }

  const src = shown ? `${videoThumbnailUrl(videoId)}?v=${version}` : null;
  const canPick = canFramePick(durationSeconds);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
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

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-fg-muted">Upload an image</p>
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
      </div>

      {canPick ? (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          {picking ? (
            <FramePicker
              videoId={videoId}
              hasStoryboard={hasStoryboard}
              durationSeconds={durationSeconds as number}
              busy={busy}
              onUse={(t) => void applyFrame(t)}
              onCancel={() => {
                setPicking(false);
                setError(null);
              }}
            />
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setError(null);
                setPicking(true);
              }}
              className="self-start"
            >
              <VideoIcon size={16} aria-hidden="true" />
              Pick from video
            </Button>
          )}
        </div>
      ) : null}

      {busy ? <p className="text-xs text-fg-muted">Saving…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

// FramePicker is the inline scrubber for "Pick from video". It seeks a preview
// (storyboard sprite when the video has one, else a muted <video> loading the
// original) as the owner drags a range, then POSTs the chosen {at_seconds}. The
// preview is a best-effort aid — a private video whose media the browser cannot
// credential (no bearer on an <img>/<video>) may show a blank frame, but the
// authenticated POST still extracts the exact frame server-side.
function FramePicker({
  videoId,
  hasStoryboard,
  durationSeconds,
  busy,
  onUse,
  onCancel,
}: {
  videoId: string;
  hasStoryboard: boolean;
  durationSeconds: number;
  busy: boolean;
  onUse: (atSeconds: number) => void;
  onCancel: () => void;
}) {
  const [at, setAt] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cues, setCues] = useState<StoryboardCue[] | null>(null);

  // Load the storyboard cue map once when the picker opens (the sprite sheet is
  // referenced by <div> background so it fetches lazily on first paint). A
  // missing/failed VTT just yields the <video> fallback below.
  useEffect(() => {
    if (!hasStoryboard) return;
    const controller = new AbortController();
    fetch(videoStoryboardVttUrl(videoId), { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (text !== "") setCues(parseStoryboardVtt(text));
      })
      .catch(() => {
        // No cues — the <video> fallback handles the preview.
      });
    return () => controller.abort();
  }, [videoId, hasStoryboard]);

  // Seek the fallback <video> as the scrub moves (no-op when storyboard cues are
  // driving the preview instead).
  function seekTo(next: number) {
    const clamped = clampFrameTime(next, durationSeconds);
    setAt(clamped);
    const v = videoRef.current;
    if (v && Number.isFinite(v.duration)) v.currentTime = clamped;
  }

  const cue = cues && cues.length > 0 ? cueAt(cues, at) : null;
  const useStoryboardPreview = hasStoryboard && cue !== null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-fg-muted">Pick a frame</p>
      <div className="flex aspect-video w-full max-w-72 items-center justify-center overflow-hidden rounded-lg bg-surface-strong">
        {useStoryboardPreview && cue ? (
          <div
            aria-label="Frame preview"
            role="img"
            style={{
              width: `${cue.w}px`,
              height: `${cue.h}px`,
              backgroundImage: `url("${videoStoryboardImageUrl(videoId)}")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: `-${cue.x}px -${cue.y}px`,
            }}
          />
        ) : (
          <video
            ref={videoRef}
            src={videoOriginalUrl(videoId)}
            aria-label="Frame preview"
            muted
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
            className="h-full w-full object-contain"
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v) v.currentTime = clampFrameTime(at, durationSeconds);
            }}
          />
        )}
      </div>
      <input
        type="range"
        aria-label="Frame position"
        min={0}
        max={durationSeconds}
        step={Math.max(0.1, durationSeconds / 200)}
        value={at}
        disabled={busy}
        onChange={(e) => seekTo(Number(e.target.value))}
        className="w-full max-w-72 accent-fg focus-ring disabled:opacity-60"
      />
      <p className="text-xs tabular-nums text-fg-muted">
        {formatDuration(at)} / {formatDuration(durationSeconds)}
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => onUse(at)}>
          Use this frame
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
