"use client";

import { useCallback, useEffect, useState } from "react";

import { SlashCircleIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { BlockedRemoteVideo } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// BlockedRemoteVideosView is the FEDERATED half of the moderation block-list:
// every currently-blocked remote video with its origin identity (title, channel
// name@domain, origin instance), the block reason/author/time, and an Unblock
// control. A blocked remote video is hidden from every local surface including
// /remote/{id}, so the review link goes to the origin's watch page. Role-gated
// by RoleGate (an under-privileged/anonymous viewer sees the shared permission
// prompt and nothing fetches).
export function BlockedRemoteVideosView() {
  return (
    <RoleGate minRole="moderator" action="review blocked videos">
      <BlockList />
    </RoleGate>
  );
}

function BlockList() {
  const [status, setStatus] = useState<Status>("loading");
  const [videos, setVideos] = useState<BlockedRemoteVideo[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getBlockedRemoteVideos({ limit: 100 }, controller.signal)
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
    setVideos((prev) => prev.filter((v) => v.remote_video_id !== id));
  }, []);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading blocked remote videos" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load the remote block-list." onRetry={retry} />;
  }
  if (videos.length === 0) {
    return (
      <EmptyState
        icon={<SlashCircleIcon size={24} />}
        title="No blocked remote videos"
        message="When a moderator blocks a federated video it is hidden from all local surfaces and listed here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {videos.map((video) => (
        <li key={video.remote_video_id}>
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
  video: BlockedRemoteVideo;
  onUnblocked: (id: string) => void;
}) {
  const [rowState, setRowState] = useState<RowState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function unblock() {
    if (rowState === "submitting") return;
    setRowState("submitting");
    setError(null);
    try {
      await api.unblockRemoteVideo(video.remote_video_id);
      onUnblocked(video.remote_video_id);
    } catch (err) {
      setError(errorMessage(err, "Could not unblock this video."));
      setRowState("idle");
    }
  }

  return (
    <article className="rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* While blocked the local /remote/{id} surface 404s, so review the
              content at its origin (external, rel-guarded). */}
          <a
            href={video.watch_url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2"
          >
            {video.title || "Untitled video"}
          </a>
          <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[13px] text-fg-muted">
            {/* Origin channel identity (name@domain) — not a local route. */}
            <span>{video.channel_handle}</span>
            <span aria-hidden> · </span>
            <span>
              <span className="sr-only">From </span>
              {video.domain}
            </span>
            <span aria-hidden> · </span>
            <span>blocked {relativeTime(video.blocked_at)}</span>
            {video.blocked_by ? (
              <>
                <span aria-hidden> · </span>
                <span>
                  by{" "}
                  <span className="font-medium text-fg">
                    {video.blocked_by}
                  </span>
                </span>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          disabled={rowState === "submitting"}
          aria-label={`Unblock ${video.title || "this remote video"}`}
          onClick={() => void unblock()}
          className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
        >
          Unblock
        </button>
      </div>

      {video.reason ? (
        <p className="mt-2 text-sm text-fg">
          <span className="font-medium">Reason:</span> {video.reason}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </article>
  );
}
