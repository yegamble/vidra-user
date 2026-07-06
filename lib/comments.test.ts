import { describe, expect, it } from "vitest";

import type { Comment } from "@/lib/api";

import { buildCommentTree } from "./comments";

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
