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
//
// It is THREADED, off parent_object_url — the ORIGIN's id for the comment a row
// answers (migration 0140). Replies arrive in any order and can arrive before
// their parent, so the shape is rebuilt on read rather than trusted from the
// list order, and a reply whose parent this instance was never sent renders at
// the top level: the contract's own rule is that a thread with a hole beats a
// dropped reply.

// maxThreadDepth caps the visual nesting. Deeper replies keep their "Replying
// to" line and stop indenting, so a long chain cannot walk the text off a phone.
const maxThreadDepth = 4;

// threadedComment is one mirrored row plus what rendering needs and the API
// does not carry: how deep it sits, and who it answers.
type threadedComment = RemoteVideoComment & { depth: number; replyingTo?: string };

// threadComments orders the origin's rows parent-before-child, depth-first,
// keeping the origin's own order within each level.
//
// Parents are matched on object_url, and a row whose parent_object_url names
// something absent (never mirrored, or hidden from THIS reader by a block) is
// treated as a root — the same answer as no parent at all, which is what keeps
// a per-viewer block from swallowing everything underneath it.
export function threadComments(comments: RemoteVideoComment[]): threadedComment[] {
  const byURL = new Map(comments.map((c) => [c.object_url, c]));
  const children = new Map<string, RemoteVideoComment[]>();
  const roots: RemoteVideoComment[] = [];
  for (const c of comments) {
    const parent = c.parent_object_url;
    // A row that is its own parent, or whose parent is not here, is a root.
    if (parent && parent !== c.object_url && byURL.has(parent)) {
      children.set(parent, [...(children.get(parent) ?? []), c]);
    } else {
      roots.push(c);
    }
  }
  const out: threadedComment[] = [];
  const seen = new Set<string>();
  const walk = (c: RemoteVideoComment, depth: number, parentName?: string) => {
    // Cycle guard: parent_object_url is the ORIGIN's text, not a foreign key,
    // so a hostile or broken peer can describe a loop.
    if (seen.has(c.object_url)) return;
    seen.add(c.object_url);
    out.push({ ...c, depth, replyingTo: parentName });
    for (const child of children.get(c.object_url) ?? []) walk(child, depth + 1, c.author_name);
  };
  for (const root of roots) walk(root, 0);
  // Anything a cycle stranded is still shown, flat, rather than dropped.
  for (const c of comments) {
    if (!seen.has(c.object_url)) out.push({ ...c, depth: 0 });
  }
  return out;
}

export function RemoteVideoThread({ videoId }: { videoId: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .getRemoteVideoComments(videoId, { limit: FULL_LIST_LIMIT }, signal)
        .then((res) => threadComments(res.comments)),
    [videoId],
  );

  return (
    <section aria-labelledby="remote-thread-heading" className="flex flex-col gap-3">
      <h2 id="remote-thread-heading" className="text-[15px] font-bold tracking-[-0.01em]">
        Comments from the origin
      </h2>
      <ManagedList<threadedComment>
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
          <article
            className="flex flex-col gap-1 py-3"
            data-thread-depth={comment.depth}
            style={
              comment.depth > 0
                ? { paddingInlineStart: `${Math.min(comment.depth, maxThreadDepth) * 16}px` }
                : undefined
            }
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <span className="font-semibold text-fg">{comment.author_name}</span>
              <FederatedOriginBadge domain={comment.author_domain} size="sm" />
              <span className="text-fg-muted">
                {relativeTime(comment.published_at ?? comment.created_at)}
              </span>
              {comment.edited ? <span className="text-fg-muted">· edited</span> : null}
            </div>
            {/* Indentation is not an accessible name, and it runs out at
                maxThreadDepth; the reply says whom it answers in words. */}
            {comment.replyingTo ? (
              <p className="text-[13px] text-fg-muted">Replying to {comment.replyingTo}</p>
            ) : null}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{comment.body}</p>
          </article>
        )}
      />
    </section>
  );
}
