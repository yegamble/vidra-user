"use client";

import { useEffect, useState } from "react";

import { InfoIcon } from "@/components/icons";
import { api } from "@/lib/api";

// How often the still-transcoding watch page re-reads the detail to learn the
// transcode finished. Coarse on purpose: transcodes take minutes, and the note
// disappearing is a nicety, not a live progress meter.
const TRANSCODE_POLL_INTERVAL_MS = 30_000;

/**
 * TranscodingNote — the subtle "still processing" line under the player, shown
 * while the video detail reports `transcoding: true` (a transcode job is still
 * live). While visible it polls GET /videos/{id} every ~30s and removes itself
 * once `transcoding` comes back false/absent. It deliberately does NOT hot-swap
 * the player source mid-session — the copy covers it, and HLS is picked up on
 * the next load. Render it only when the detail said `transcoding === true`
 * (and key it by video id so a navigation resets the internal state).
 */
export function TranscodingNote({
  videoId,
  playbackToken,
}: {
  videoId: string;
  /** The password-video playback token, threaded so the poll stays authorized. */
  playbackToken?: string | null;
}) {
  const [transcoding, setTranscoding] = useState(true);

  useEffect(() => {
    if (!transcoding) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      api
        .getVideo(videoId, playbackToken ?? undefined, controller.signal)
        .then((v) => {
          // Absent means false on the contract (DETAIL-only flag).
          if (v.transcoding !== true) setTranscoding(false);
        })
        // A failed poll keeps the note — the next tick retries; never noisy.
        .catch(() => {});
    }, TRANSCODE_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [transcoding, videoId, playbackToken]);

  if (!transcoding) return null;
  return (
    <p
      role="status"
      className="mt-2 flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2 text-[13px] leading-relaxed text-fg-muted"
    >
      <InfoIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        This video is still being processed. It may not play smoothly or be available in all
        qualities yet.
      </span>
    </p>
  );
}
