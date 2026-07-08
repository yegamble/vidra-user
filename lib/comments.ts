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
/**
 * rootIdOf walks a comment's parent chain up to its top-level ancestor id.
 * `seen` guards against a malformed cycle so this can never loop forever. It is
 * shared by `buildCommentTree` (to group each flattened reply under its root)
 * and `replyMention` (to decide whether a reply targets another reply vs. the
 * thread root) so both agree on what "the top of this thread" means — including
 * the orphan case, where a reply whose own parent isn't loaded is itself the
 * root of the thread it heads.
 */
export function rootIdOf(c: Comment, byId: Map<string, Comment>): string {
  let cur = c;
  const seen = new Set<string>();
  while (cur.parent_id && byId.has(cur.parent_id) && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parent_id) as Comment;
  }
  return cur.id;
}

export function buildCommentTree(comments: Comment[]): CommentThread[] {
  const byId = new Map<string, Comment>();
  for (const c of comments) byId.set(c.id, c);

  const isReply = (c: Comment): boolean => Boolean(c.parent_id && byId.has(c.parent_id));

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
    const idx = indexByRootId.get(rootIdOf(c, byId));
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

/**
 * replyMention resolves the leading "@username" a rendered reply should show to
 * disambiguate WHO it answers inside the flattened thread — the YouTube parity
 * the reply-attribution feature is about.
 *
 * The handle is fully client-derivable (no backend field): every reply carries
 * `parent_id`, the whole loaded list is in `byId`, and each row carries
 * `author_username`. Returns the parent author's handle iff the reply targets
 * ANOTHER reply — i.e. its parent is itself a reply, so the parent id differs
 * from the thread's top-level ancestor id (`rootIdOf`). Returns null when:
 *
 *  - the comment is top-level / has no parent (nothing to attribute);
 *  - the reply answers the top-level comment directly (`parent_id === rootId`):
 *    it renders right under that comment's header, so a mention is redundant;
 *  - the parent scrolled past the loaded window (absent from `byId`) — the reply
 *    is then promoted to its own thread by `buildCommentTree`, so it is no longer
 *    a flattened-ambiguous reply and needs no mention;
 *  - the parent is a tombstone (`deleted`) — never render a broken "@handle".
 *
 * Deriving on the client (rather than a server-populated field) also avoids a
 * mute/block leak: a parent the viewer muted/blocked is filtered out of the list
 * server-side, so it isn't in `byId` and its handle is naturally omitted.
 */
export function replyMention(
  reply: Comment,
  byId: Map<string, Comment>,
): { username: string } | null {
  if (!reply.parent_id) return null;
  const parent = byId.get(reply.parent_id);
  if (!parent) return null;
  if (parent.deleted) return null;
  // A direct reply to the top-level comment: its parent IS the thread root, so
  // the mention would be redundant.
  if (reply.parent_id === rootIdOf(reply, byId)) return null;
  return { username: parent.author_username };
}
