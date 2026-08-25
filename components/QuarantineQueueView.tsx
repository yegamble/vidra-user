"use client";

import { useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { ShieldIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { QuarantinedVideo } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

const MAX_REASON_LEN = 2000;

// QuarantineQueueView is the moderator/admin review queue for uploads held by
// the QUARANTINE_NEW_UPLOADS instance setting. Approving publishes the video
// through the real publish transition; rejecting fails it and notifies the
// owner (the optional reason is recorded in the audit trail only — the
// contract never shows it to the owner). Role-gated by RoleGate.
export function QuarantineQueueView() {
  return (
    <RoleGate minRole="moderator" action="review held uploads">
      <ListBoundary label="held uploads">
        <Queue />
      </ListBoundary>
    </RoleGate>
  );
}

function Queue() {
  const list = usePagedList<QuarantinedVideo>({
    load: (query, signal) =>
      api
        .getQuarantinedVideos({ limit: query.limit, offset: query.offset }, signal)
        .then((res) => ({
          items: res.videos,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  return (
    <PagedListShell
      list={list}
      noun="held upload"
      errorMessage="Could not load the quarantine queue."
      emptyIcon={<ShieldIcon size={24} />}
      emptyTitle="No uploads waiting for review"
      emptyMessage="When this instance holds a new upload for review, it appears here for approval or rejection."
    >
      <ul className="flex flex-col gap-3">
        {list.items.map((video) => (
          <li key={video.id}>
            {/* A decided upload leaves the queue for good — off the total too. */}
            <QuarantineRow
              video={video}
              onDecided={(id) => list.drop((v) => v.id !== id)}
            />
          </li>
        ))}
      </ul>
    </PagedListShell>
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
      setError(errorMessage(err, "Could not update this upload."));
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-warning">
          quarantined
        </span>
        <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-fg-muted">
          {video.privacy}
        </span>
        <span>
          by{" "}
          <span className="font-medium text-fg">
            {video.owner_username}
          </span>{" "}
          on {video.channel_display_name} (@{video.channel_handle})
        </span>
        <span aria-hidden>·</span>
        <span>{relativeTime(video.created_at)}</span>
      </div>

      {/* Not a link: a quarantined video is not publicly watchable until approved. */}
      <p className="mt-2 text-sm font-semibold text-fg">{video.title}</p>

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-fg-muted">
            Rejection reason (optional, recorded in the audit trail — not shown to the owner)
          </span>
          <textarea
            aria-label={`Rejection reason for ${video.title}`}
            rows={2}
            maxLength={MAX_REASON_LEN}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void decide("approve")}>
            Approve
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => void decide("reject")}
          >
            Reject
          </Button>
        </div>
      </div>
    </article>
  );
}
