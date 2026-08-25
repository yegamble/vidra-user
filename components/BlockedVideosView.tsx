"use client";

import Link from "next/link";
import { useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { api, errorMessage } from "@/lib/api";
import type { BlockedVideo } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

// BlockedVideosView is the moderator/admin block-list: every currently-blocked
// video with the context to review it (channel, reason, who blocked it, when)
// and an Unblock control. Role-gated by RoleGate (an under-privileged/anonymous
// viewer sees the shared permission prompt and nothing fetches).
export function BlockedVideosView() {
  return (
    <RoleGate minRole="moderator" action="review blocked videos">
      <ListBoundary label="blocked videos">
        <BlockList />
      </ListBoundary>
    </RoleGate>
  );
}

function BlockList() {
  const list = usePagedList<BlockedVideo>({
    load: (query, signal) =>
      api
        .getBlockedVideos({ limit: query.limit, offset: query.offset }, signal)
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
      noun="blocked video"
      errorMessage="Could not load the block-list."
      emptyTitle="No blocked videos"
      emptyMessage="When a moderator blocks a video it is hidden from public surfaces and listed here."
    >
      <ul className="flex flex-col gap-3">
        {list.items.map((video) => (
          <li key={video.video_id}>
            {/* An unblocked video really leaves this list, so it must leave the
                total too — `drop`, not a local filter. */}
            <BlockedRow
              video={video}
              onUnblocked={(id) => list.drop((v) => v.video_id !== id)}
            />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

type RowState = "idle" | "submitting";

function BlockedRow({
  video,
  onUnblocked,
}: {
  video: BlockedVideo;
  onUnblocked: (id: string) => void;
}) {
  const [rowState, setRowState] = useState<RowState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function unblock() {
    if (rowState === "submitting") return;
    setRowState("submitting");
    setError(null);
    try {
      await api.unblockVideo(video.video_id);
      onUnblocked(video.video_id);
    } catch (err) {
      setError(errorMessage(err, "Could not unblock this video."));
      setRowState("idle");
    }
  }

  return (
    <article className="rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/videos/${video.video_id}`}
            className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2 transition-colors hover:text-fg-muted"
          >
            {video.title || "Untitled video"}
          </Link>
          <p className="mt-1 text-[13px] text-fg-muted">
            <Link
              href={`/channels/${video.channel_handle}`}
              className="focus-ring rounded-sm transition-colors hover:text-fg"
            >
              {video.channel_display_name || video.channel_handle}
            </Link>
            <span aria-hidden> · </span>
            <span>blocked {relativeTime(video.blocked_at)}</span>
            {video.blocked_by ? (
              <>
                <span aria-hidden> · </span>
                <span>
                  by <span className="font-medium text-fg">{video.blocked_by}</span>
                </span>
              </>
            ) : null}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={rowState === "submitting"}
          onClick={() => void unblock()}
          className="shrink-0"
        >
          Unblock
        </Button>
      </div>

      {video.reason ? (
        <p className="mt-2 text-sm text-fg-muted">
          <span className="font-semibold text-fg">Reason:</span> {video.reason}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </article>
  );
}
