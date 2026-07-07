"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { BlockedVideo } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// BlockedVideosView is the moderator/admin block-list: every currently-blocked
// video with the context to review it (channel, reason, who blocked it, when)
// and an Unblock control. Role-gated by RoleGate (an under-privileged/anonymous
// viewer sees the shared permission prompt and nothing fetches).
export function BlockedVideosView() {
  return (
    <RoleGate minRole="moderator" action="review blocked videos">
      <BlockList />
    </RoleGate>
  );
}

function BlockList() {
  const [status, setStatus] = useState<Status>("loading");
  const [videos, setVideos] = useState<BlockedVideo[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getBlockedVideos({ limit: 100 }, controller.signal)
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

  // After an unblock, drop the row locally so it disappears immediately; a later
  // refetch confirms persistence.
  const onUnblocked = useCallback((id: string) => {
    setVideos((prev) => prev.filter((v) => v.video_id !== id));
  }, []);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading blocked videos" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load the block-list." onRetry={retry} />;
  }
  if (videos.length === 0) {
    return (
      <EmptyState
        title="No blocked videos"
        message="When a moderator blocks a video it is hidden from public surfaces and listed here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {videos.map((video) => (
        <li key={video.video_id}>
          <BlockedRow video={video} onUnblocked={onUnblocked} />
        </li>
      ))}
    </ul>
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
    <article className="rounded-2xl bg-surface-muted p-4">
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
