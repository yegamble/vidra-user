"use client";

import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ClockIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { VideoCard } from "@/components/VideoCard";
import { VideoGrid } from "@/components/VideoGrid";
import { api } from "@/lib/api";
import type { HistoryItem } from "@/lib/api";
import { formatDuration, relativeTime } from "@/lib/format";
import { resumeFraction } from "@/lib/resume-progress";
import { useApiResource } from "@/lib/use-api-resource";
import { SignInGate } from "@/components/SignInGate";

// WatchHistoryView shows the signed-in user's watch history (most-recently
// watched first) with a per-item remove and a clear-all control. The session
// lives in memory, so a hard reload lands here signed out — we prompt to sign in.
export function WatchHistoryView() {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <SignInGate icon={<ClockIcon size={24} />} title="Sign in to see your history">
        to keep track of what you have watched.
      </SignInGate>
    );
  }

  return <History />;
}

function History() {
  const {
    status,
    data,
    retry,
    setData: setItems,
  } = useApiResource<HistoryItem[]>((signal) =>
    api.getWatchHistory({}, signal).then((res) => res.videos),
  );
  const items = data ?? [];
  const [clearing, setClearing] = useState(false);

  async function remove(id: string) {
    const prev = items;
    setItems((list) => (list ?? []).filter((it) => it.id !== id)); // optimistic
    try {
      await api.deleteHistoryEntry(id);
    } catch {
      setItems(prev); // restore on failure
    }
  }

  async function clearAll() {
    if (clearing) return;
    setClearing(true);
    const prev = items;
    setItems([]); // optimistic
    try {
      await api.clearWatchHistory();
    } catch {
      setItems(prev);
    } finally {
      setClearing(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading your history" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load your history." onRetry={retry} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ClockIcon size={24} />}
        title="No watch history yet"
        message="Videos you watch will show up here so you can pick up where you left off."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void clearAll()}
          disabled={clearing}
          className="focus-ring rounded-full px-3.5 py-2 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-60"
        >
          Clear all history
        </button>
      </div>
      <VideoGrid>
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2">
            <VideoCard
              video={item}
              progressFraction={
                resumeFraction(item.position_seconds, item.duration_seconds) ?? undefined
              }
              onDeleted={() => setItems((list) => (list ?? []).filter((it) => it.id !== item.id))}
            />
            <div className="flex items-center justify-between gap-2 text-[13px] text-fg-muted">
              <span className="tabular-nums">
                {item.position_seconds > 0
                  ? `Resume at ${formatDuration(item.position_seconds)}`
                  : "Watched"}
                {item.watched_at ? ` · ${relativeTime(item.watched_at)}` : ""}
              </span>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                aria-label={`Remove ${item.title} from history`}
                className="focus-ring -m-2 shrink-0 rounded-full p-2 font-semibold transition-colors hover:text-fg"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </VideoGrid>
    </div>
  );
}
