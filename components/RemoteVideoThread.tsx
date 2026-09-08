"use client";

import { useCallback } from "react";

import { FederatedOriginBadge } from "@/components/FederatedOriginBadge";
import { ManagedList } from "@/components/ManagedList";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import type { RemoteVideoComment } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import { relativeTime } from "@/lib/format";

// RemoteVideoThread renders the comments this instance has MIRRORED for a
// federated video — the thread its origin fans out to its followers.
//
// It is READ-ONLY, and the missing composer is the design rather than an
// omission: these rows are somebody else's thread, and nothing here writes one.
// The page's own copy already says where authoring lives ("Comments, ratings,
// and saving live on the origin instance"), and every comment carries its
// object_url on the origin so a reader can go there.
//
// Two things it shows that a local thread does not, both because a federated
// thread can span instances: each author is labelled with their own DOMAIN
// (which is what makes two "ada"s from different servers distinguishable), and
// an edited comment says so, because an origin can rewrite a comment under a
// reader after they have read it.
export function RemoteVideoThread({ videoId }: { videoId: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .getRemoteVideoComments(videoId, { limit: FULL_LIST_LIMIT }, signal)
        .then((res) => res.comments),
    [videoId],
  );

  return (
    <section aria-labelledby="remote-thread-heading" className="flex flex-col gap-3">
      <h2 id="remote-thread-heading" className="text-[15px] font-bold tracking-[-0.01em]">
        Comments from the origin
      </h2>
      <ManagedList<RemoteVideoComment>
        load={load}
        rowKey={(comment) => comment.id}
        loadingLabel="Loading comments"
        errorText="Could not load the comments from the origin instance."
        empty={
          <EmptyState
            title="No comments here yet"
            // Deliberately honest about WHY it may be empty: this instance only
            // holds what it was sent, and it was only sent what arrived after
            // someone here followed the channel.
            message="This instance mirrors the comments its origin sends it, so a thread that started before anyone here followed the channel is not shown. The origin's own page has the full thread."
          />
        }
        renderRow={(comment) => (
          <article className="flex flex-col gap-1 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <span className="font-semibold text-fg">{comment.author_name}</span>
              <FederatedOriginBadge domain={comment.author_domain} size="sm" />
              <span className="text-fg-muted">
                {relativeTime(comment.published_at ?? comment.created_at)}
              </span>
              {comment.edited ? <span className="text-fg-muted">· edited</span> : null}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{comment.body}</p>
          </article>
        )}
      />
    </section>
  );
}
