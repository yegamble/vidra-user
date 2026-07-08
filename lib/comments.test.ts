import { describe, expect, it } from "vitest";

import type { Comment } from "@/lib/api";

import { buildCommentTree, replyMention } from "./comments";

function byIdOf(comments: Comment[]): Map<string, Comment> {
  return new Map(comments.map((c) => [c.id, c] as const));
}

function mk(id: string, overrides: Partial<Comment> = {}): Comment {
  return {
    id,
    video_id: "v1",
    body: `body-${id}`,
    parent_id: null,
    author_id: `author-${id}`,
    author_username: `user-${id}`,
    author_display_name: `User ${id}`,
    remote: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    edited: false,
    deleted: false,
    ...overrides,
  };
}

describe("buildCommentTree", () => {
  it("keeps top-level comments in their incoming (newest-first) order", () => {
    const threads = buildCommentTree([mk("a"), mk("b"), mk("c")]);
    expect(threads.map((t) => t.root.id)).toEqual(["a", "b", "c"]);
    expect(threads.every((t) => t.replies.length === 0)).toBe(true);
  });

  it("nests a reply under its parent, oldest-first", () => {
    const parent = mk("p", { created_at: "2026-01-01T00:00:00.000Z" });
    const r1 = mk("r1", { parent_id: "p", created_at: "2026-01-01T00:00:02.000Z" });
    const r2 = mk("r2", { parent_id: "p", created_at: "2026-01-01T00:00:01.000Z" });
    // API serves replies inline in some order; the tree sorts them oldest-first.
    const threads = buildCommentTree([parent, r1, r2]);
    expect(threads).toHaveLength(1);
    expect(threads[0].root.id).toBe("p");
    expect(threads[0].replies.map((c) => c.id)).toEqual(["r2", "r1"]);
  });

  it("flattens a reply-to-a-reply under the top-level ancestor (one visual level)", () => {
    const parent = mk("p");
    const reply = mk("r", { parent_id: "p", created_at: "2026-01-01T00:00:01.000Z" });
    const nested = mk("n", { parent_id: "r", created_at: "2026-01-01T00:00:02.000Z" });
    const threads = buildCommentTree([parent, reply, nested]);
    expect(threads).toHaveLength(1);
    expect(threads[0].root.id).toBe("p");
    // Both the reply and the reply-to-the-reply live under the single root.
    expect(threads[0].replies.map((c) => c.id)).toEqual(["r", "n"]);
  });

  it("promotes an orphan reply (parent not loaded) to its own top-level thread", () => {
    const orphan = mk("o", { parent_id: "missing" });
    const threads = buildCommentTree([orphan]);
    expect(threads).toHaveLength(1);
    expect(threads[0].root.id).toBe("o");
    expect(threads[0].replies).toEqual([]);
  });

  it("treats a null/undefined parent_id as top-level", () => {
    const a = mk("a", { parent_id: null });
    // Mocked API rows can omit parent_id entirely (undefined at runtime).
    const b = { ...mk("b"), parent_id: undefined } as unknown as Comment;
    const threads = buildCommentTree([a, b]);
    expect(threads.map((t) => t.root.id)).toEqual(["a", "b"]);
  });

  it("does not loop forever on a malformed parent cycle", () => {
    const a = mk("a", { parent_id: "b" });
    const b = mk("b", { parent_id: "a" });
    // Both point at each other; neither is a true root. Guarded walk terminates.
    const threads = buildCommentTree([a, b]);
    // No infinite loop, and every input is still accounted for.
    const seen = threads.flatMap((t) => [t.root.id, ...t.replies.map((r) => r.id)]);
    expect(seen).toContain("a");
    expect(seen).toContain("b");
  });
});

describe("replyMention", () => {
  it("returns the parent author's handle for a reply-to-reply", () => {
    const root = mk("c1", { author_username: "bob" });
    const r1 = mk("r1", { parent_id: "c1", author_username: "ada" });
    const r2 = mk("r2", { parent_id: "r1", author_username: "cat" });
    const byId = byIdOf([root, r1, r2]);
    // r2 answers r1 (itself a reply), so it should mention r1's author.
    expect(replyMention(r2, byId)).toEqual({ username: "ada" });
  });

  it("returns null for a direct reply to the top-level comment (redundant)", () => {
    const root = mk("c1", { author_username: "bob" });
    const r1 = mk("r1", { parent_id: "c1", author_username: "ada" });
    const byId = byIdOf([root, r1]);
    expect(replyMention(r1, byId)).toBeNull();
  });

  it("returns null for a top-level comment (no parent)", () => {
    const root = mk("c1");
    expect(replyMention(root, byIdOf([root]))).toBeNull();
  });

  it("returns null when the parent is not in the loaded window", () => {
    // r2's immediate parent "r1" scrolled past the page: buildCommentTree
    // promotes r2 to its own thread, so it is not a flattened-ambiguous reply.
    const r2 = mk("r2", { parent_id: "r1", author_username: "cat" });
    expect(replyMention(r2, byIdOf([r2]))).toBeNull();
  });

  it("returns null when the parent reply is tombstoned (no broken @)", () => {
    const root = mk("c1", { author_username: "bob" });
    const r1 = mk("r1", { parent_id: "c1", author_username: "ada", deleted: true, body: "[deleted]" });
    const r2 = mk("r2", { parent_id: "r1", author_username: "cat" });
    const byId = byIdOf([root, r1, r2]);
    expect(replyMention(r2, byId)).toBeNull();
  });

  it("returns null when the parent reply is an orphan promoted to its own root", () => {
    // r1's own parent isn't loaded → r1 heads its own thread; a reply to r1 is a
    // direct-reply-to-root of that promoted thread, so no mention.
    const r1 = mk("r1", { parent_id: "missing", author_username: "ada" });
    const r2 = mk("r2", { parent_id: "r1", author_username: "cat" });
    expect(replyMention(r2, byIdOf([r1, r2]))).toBeNull();
  });

  it("mentions a remote parent by its author-name snapshot", () => {
    const root = mk("c1", { author_username: "bob" });
    const remote = mk("rm1", {
      parent_id: "c1",
      remote: true,
      author_id: null,
      author_username: "remote-rene",
      author_domain: "videos.example",
    });
    const r2 = mk("r2", { parent_id: "rm1", author_username: "cat" });
    const byId = byIdOf([root, remote, r2]);
    expect(replyMention(r2, byId)).toEqual({ username: "remote-rene" });
  });
});
