"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminSearch } from "@/components/admin/AdminControls";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { AdminVideo } from "@/lib/api";
import { formatCount, relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// AdminVideosView is the moderator/admin videos overview: browse every video
// (any privacy/state) and block/unblock any of them. Role-gated by RoleGate (an
// under-privileged/anonymous viewer sees the shared permission prompt and
// nothing fetches).
export function AdminVideosView() {
  return (
    <RoleGate minRole="moderator" action="manage videos">
      <VideosList />
    </RoleGate>
  );
}

function VideosList() {
  const [status, setStatus] = useState<Status>("loading");
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getAdminVideos({ q: query || undefined, limit: 100 }, controller.signal)
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
  }, [query, reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  const submitSearch = useCallback(
    (next: string) => {
      if (next === query) return;
      setStatus("loading");
      setQuery(next);
    },
    [query],
  );

  // Reflect a block/unblock back into the row.
  const onBlockedChange = useCallback((id: string, blocked: boolean) => {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, blocked } : v)));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <AdminSearch
        label="Search videos by title"
        placeholder="Search by title"
        value={input}
        onChange={setInput}
        onSubmit={() => submitSearch(input.trim())}
        onClear={() => {
          setInput("");
          submitSearch("");
        }}
        hasQuery={Boolean(query)}
      />

      {status === "loading" ? (
        <div className="flex justify-center py-24">
          <Spinner label="Loading videos" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load videos." onRetry={retry} />
      ) : videos.length === 0 ? (
        <EmptyState
          title={query ? "No matching videos" : "No videos yet"}
          message={query ? "Try a different search term." : "Videos will appear here as they are published."}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {videos.map((v) => (
            <li key={v.id}>
              <VideoRow video={v} onBlockedChange={onBlockedChange} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PRIVACY_STYLE: Record<string, string> = {
  public: "bg-success/15 text-success",
  unlisted: "bg-warning/15 text-warning",
  private: "bg-surface-strong text-fg-muted",
};

// Shared uppercase micro-pill recipe for the privacy/state/blocked badges.
const PILL =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-[0.04em] uppercase";

function VideoRow({
  video,
  onBlockedChange,
}: {
  video: AdminVideo;
  onBlockedChange: (id: string, blocked: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleBlock() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (video.blocked) {
        await api.unblockVideo(video.id);
        onBlockedChange(video.id, false);
      } else {
        await api.blockVideo(video.id);
        onBlockedChange(video.id, true);
      }
    } catch (err) {
      setError(errorMessage(err, "Could not update this video."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/videos/${video.id}`}
            className="focus-ring rounded font-semibold tracking-tight text-fg transition-colors hover:text-fg-muted hover:underline"
          >
            {video.title || "Untitled video"}
          </Link>
          <p className="mt-1 text-[13px] text-fg-muted">
            <Link
              href={`/channels/${video.channel_handle}`}
              className="focus-ring rounded transition-colors hover:text-fg"
            >
              {video.channel_display_name || video.channel_handle}
            </Link>
            <span aria-hidden> · </span>
            <span className="tabular-nums">{formatCount(video.views)} views</span>
            <span aria-hidden> · </span>
            <span>{relativeTime(video.created_at)}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`${PILL} ${PRIVACY_STYLE[video.privacy] ?? PRIVACY_STYLE.private}`}>
              {video.privacy}
            </span>
            <span className={`${PILL} bg-surface-strong text-fg-muted`}>
              {video.state}
            </span>
            {video.blocked ? (
              <span className={`${PILL} bg-danger-surface text-danger`}>
                blocked
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleBlock()}
          className={
            video.blocked
              ? "focus-ring inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-60"
              : "focus-ring inline-flex shrink-0 items-center justify-center rounded-full border border-danger-border px-3.5 py-1.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:pointer-events-none disabled:opacity-60"
          }
        >
          {video.blocked ? "Unblock" : "Block"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </article>
  );
}
