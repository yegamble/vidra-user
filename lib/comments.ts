import type { Comment } from "@/lib/api";

/** A top-level comment with its (flattened) replies, ready to render. */
export type CommentThread = {
  root: Comment;
  replies: Comment[];
};

/**
 * buildCommentTree turns the flat comment list the API returns into
 * PeerTube-style threads: top-level comments in their incoming order (the API
 * serves newest-first) each carrying a single, flattened list of descendant
 * replies sorted oldest-first.
 *
 * "Flattened" is deliberate: a reply-to-a-reply nests only one level visually —
 * it is grouped under its top-level ancestor rather than rendered as an
 * ever-deepening chain. A comment whose `parent_id` points at a comment that is
 * not in the loaded page (an orphan, e.g. its parent scrolled past the limit)
 * is promoted to a top-level thread of its own so it never silently disappears.
 */
export function buildCommentTree(comments: Comment[]): CommentThread[] {
  const byId = new Map<string, Comment>();
  for (const c of comments) byId.set(c.id, c);

  const isReply = (c: Comment): boolean => Boolean(c.parent_id && byId.has(c.parent_id));

  // Walk a reply's parent chain up to its top-level ancestor id. `seen` guards
  // against a malformed cycle so this can never loop forever.
  function rootIdOf(c: Comment): string {
    let cur = c;
    const seen = new Set<string>();
    while (cur.parent_id && byId.has(cur.parent_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parent_id) as Comment;
    }
    return cur.id;
  }

  const threads: CommentThread[] = [];
  const indexByRootId = new Map<string, number>();

  function ensureRoot(c: Comment): number {
    const existing = indexByRootId.get(c.id);
    if (existing !== undefined) return existing;
    const idx = threads.length;
    indexByRootId.set(c.id, idx);
    threads.push({ root: c, replies: [] });
    return idx;
  }

  // First pass: roots, preserving the API's (newest-first) order.
  for (const c of comments) {
    if (!isReply(c)) ensureRoot(c);
  }

  // Second pass: attach each reply under its top-level ancestor. A reply that
  // resolves to no known root (only possible via a malformed parent cycle) is
  // promoted to its own thread so a comment is never silently dropped.
  for (const c of comments) {
    if (!isReply(c)) continue;
    const idx = indexByRootId.get(rootIdOf(c));
    if (idx !== undefined) threads[idx].replies.push(c);
    else ensureRoot(c);
  }

  // Replies read oldest-first (a conversation, top to bottom).
  for (const t of threads) {
    t.replies.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  return threads;
}
