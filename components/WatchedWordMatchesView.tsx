"use client";

import Link from "next/link";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { FlagIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import type { WatchedWordMatch } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

// WatchedWordMatchesView is the moderator/admin review queue for content that
// matched a watched term when created — comments (type "comment") and videos
// (type "video"), each badged with what was flagged. Read-only; detection
// happens on the backend at create time. Role-gated by RoleGate (an
// under-privileged/anonymous viewer sees the shared permission prompt and
// nothing fetches).
export function WatchedWordMatchesView() {
  return (
    <RoleGate minRole="moderator" action="review flagged content">
      <ListBoundary label="flagged content">
        <MatchesList />
      </ListBoundary>
    </RoleGate>
  );
}

function MatchesList() {
  const list = usePagedList<WatchedWordMatch>({
    load: (query, signal) =>
      api
        .getWatchedWordMatches({ limit: query.limit, offset: query.offset }, signal)
        .then((res) => ({
          items: res.matches,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  return (
    <PagedListShell
      list={list}
      noun="flagged item"
      errorMessage="Could not load flagged content."
      emptyIcon={<FlagIcon size={24} />}
      emptyTitle="No flagged content"
      emptyMessage="No comments or videos have matched a watched term yet."
    >
      <ul className="flex flex-col divide-y divide-border-subtle">
        {list.items.map((m) => (
          <li key={m.id} className="flex flex-col gap-1 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">{m.word}</Badge>
              {/* What was flagged: the comment's body, or the video itself. */}
              <Badge className="capitalize">{m.type}</Badge>
              <span className="text-sm text-fg-muted">by {m.author_username}</span>
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
    </PagedListShell>
  );
}
