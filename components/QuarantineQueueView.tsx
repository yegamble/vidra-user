"use client";

import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { QuarantinedVideo } from "@/lib/api";
import { relativeTime } from "@/lib/format";

const MAX_REASON_LEN = 2000;

type Status = "loading" | "error" | "ready";

// QuarantineQueueView is the moderator/admin review queue for uploads held by
// the QUARANTINE_NEW_UPLOADS instance setting. Approving publishes the video
// through the real publish transition; rejecting fails it and notifies the
// owner (the optional reason is recorded in the audit trail only — the
// contract never shows it to the owner). Role-gated by RoleGate.
export function QuarantineQueueView() {
  return (
    <RoleGate minRole="moderator" action="review held uploads">
      <Queue />
    </RoleGate>
  );
}

function Queue() {
  const [status, setStatus] = useState<Status>("loading");
  const [videos, setVideos] = useState<QuarantinedVideo[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getQuarantinedVideos({ limit: 100 }, controller.signal)
      .then((res) => {
        setVideos(res.videos);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  // A decided row drops out immediately; a later refetch confirms persistence.
  const onDecided = useCallback((id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }, []);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading held uploads" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load the quarantine queue." onRetry={retry} />;
  }
  if (videos.length === 0) {
    return (
      <EmptyState
        title="No uploads waiting for review"
        message="When this instance holds a new upload for review, it appears here for approval or rejection."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {videos.map((video) => (
        <li key={video.id}>
          <QuarantineRow video={video} onDecided={onDecided} />
        </li>
      ))}
    </ul>
  );
}

function QuarantineRow({
  video,
  onDecided,
}: {
  video: QuarantinedVideo;
  onDecided: (id: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "approve") {
        await api.approveQuarantinedVideo(video.id);
      } else {
        await api.rejectQuarantinedVideo(
          video.id,
          reason.trim() ? { reason: reason.trim() } : {},
        );
      }
      onDecided(video.id);
    } catch (err) {
      // A 409 means the video already left the quarantined state (another
      // moderator got there first) — drop the stale row instead of erroring.
      if (err instanceof ApiError && err.status === 409) {
        onDecided(video.id);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not update this upload.");
      setBusy(false);
    }
  }

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          quarantined
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600 capitalize dark:bg-zinc-800 dark:text-zinc-300">
          {video.privacy}
        </span>
        <span>
          by{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-200">
            {video.owner_username}
          </span>{" "}
          on {video.channel_display_name} (@{video.channel_handle})
        </span>
        <span aria-hidden>·</span>
        <span>{relativeTime(video.created_at)}</span>
      </div>

      {/* Not a link: a quarantined video is not publicly watchable until approved. */}
      <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{video.title}</p>

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">
            Rejection reason (optional, recorded in the audit trail — not shown to the owner)
          </span>
          <textarea
            aria-label={`Rejection reason for ${video.title}`}
            rows={2}
            maxLength={MAX_REASON_LEN}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("approve")}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("reject")}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            Reject
          </button>
        </div>
      </div>
    </article>
  );
}
