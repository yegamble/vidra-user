"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { WatchedWordMatch } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// WatchedWordMatchesView is the moderator/admin review queue for comments that
// matched a watched term when posted (read-only; detection happens on the
// backend at comment-create time). Role-gated by RoleGate (an under-privileged/
// anonymous viewer sees the shared permission prompt and nothing fetches).
export function WatchedWordMatchesView() {
  return (
    <RoleGate minRole="moderator" action="review flagged comments">
      <MatchesList />
    </RoleGate>
  );
}

function MatchesList() {
  const [status, setStatus] = useState<Status>("loading");
  const [matches, setMatches] = useState<WatchedWordMatch[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getWatchedWordMatches({ limit: 100 }, controller.signal)
      .then((res) => {
        setMatches(res.matches);
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

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading flagged comments" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load flagged comments." onRetry={retry} />;
  }
  if (matches.length === 0) {
    return (
      <EmptyState
        title="No flagged comments"
        message="No comments have matched a watched term yet."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {matches.map((m) => (
        <li key={m.id} className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-400">
              {m.word}
            </span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              by {m.author_username}
            </span>
            <Link
              href={`/videos/${m.video_id}`}
              className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              on video
            </Link>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{relativeTime(m.created_at)}</span>
          </div>
          <blockquote className="border-l-2 border-zinc-300 pl-3 text-sm whitespace-pre-wrap text-zinc-700 italic dark:border-zinc-700 dark:text-zinc-300">
            {m.comment_body}
          </blockquote>
        </li>
      ))}
    </ul>
  );
}
