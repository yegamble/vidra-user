"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FlagIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { WatchedWordMatch } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// WatchedWordMatchesView is the moderator/admin review queue for content that
// matched a watched term when created — comments (type "comment") and videos
// (type "video"), each badged with what was flagged. Read-only; detection
// happens on the backend at create time. Role-gated by RoleGate (an
// under-privileged/anonymous viewer sees the shared permission prompt and
// nothing fetches).
export function WatchedWordMatchesView() {
  return (
    <RoleGate minRole="moderator" action="review flagged content">
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
        icon={<FlagIcon size={24} />}
        title="No flagged content"
        message="No comments or videos have matched a watched term yet."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border-subtle">
      {matches.map((m) => (
        <li key={m.id} className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">{m.word}</Badge>
            {/* What was flagged: the comment's body, or the video itself. */}
            <Badge className="capitalize">{m.type}</Badge>
            <span className="text-sm text-fg-muted">
              by {m.author_username}
            </span>
            <Link
              href={`/videos/${m.video_id}`}
              className="focus-ring rounded-sm text-sm text-fg-muted underline transition-colors hover:text-fg"
            >
              {m.type === "video" ? m.video_title || "on video" : "on video"}
            </Link>
            <span className="text-[13px] text-fg-muted">{relativeTime(m.created_at)}</span>
          </div>
          {m.type === "comment" ? (
            <blockquote className="border-l-2 border-border pl-3 text-sm whitespace-pre-wrap text-fg-muted italic">
              {m.comment_body}
            </blockquote>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
