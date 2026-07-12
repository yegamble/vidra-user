// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Comment } from "@/lib/api";

// Minimal shims so CommentsSection mounts in jsdom without its heavy leaf deps.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let session: { status: string; user?: { username: string } | null };
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => session }));

// These leaf controls carry their own routers / e2ee availability hooks and are
// not under test here; stub them out so the composer + mention render in isolation.
vi.mock("@/components/e2ee/StartEncryptedButton", () => ({ StartEncryptedButton: () => null }));
vi.mock("@/components/MessageButton", () => ({ MessageButton: () => null }));
vi.mock("@/components/ReportButton", () => ({ ReportButton: () => null }));

const getVideoComments = vi.fn();
const postComment = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    getVideoComments: (...args: unknown[]) => getVideoComments(...args),
    postComment: (...args: unknown[]) => postComment(...args),
  },
  errorMessage: (_err: unknown, fallback: string) => fallback,
  userAvatarUrl: (id: string) => `/avatar/${id}`,
}));

import { CommentsSection } from "./CommentsSection";

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

function resolveComments(comments: Comment[]) {
  getVideoComments.mockResolvedValue({ comments, limit: 100, offset: 0 });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  session = { status: "authed", user: { username: "viewer" } };
});

describe("CommentsSection reply attribution", () => {
  it("shows a 'Replying to @username' chip and updates the reply textarea's accessible name", async () => {
    resolveComments([mk("c1", { author_username: "bob", author_display_name: "Bob Jones", body: "parent comment" })]);
    render(<CommentsSection videoId="v1" />);

    const reply = await screen.findByRole("button", { name: "Reply" });
    fireEvent.click(reply);

    // Visible, non-editable chip naming the target.
    const chip = screen.getByText(/Replying to/);
    expect(chip.textContent).toBe("Replying to @bob");
    // The textarea's accessible name carries the same target (announced without a
    // live region), and it is described by the chip.
    const textarea = screen.getByLabelText("Write a reply to @bob");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.getAttribute("aria-describedby")).toContain(chip.id);
  });

  it("renders a leading @mention on a reply-to-reply but not on a direct reply to the top-level comment", async () => {
    session = { status: "anon" };
    resolveComments([
      mk("c1", { author_username: "bob", body: "top level" }),
      mk("r1", {
        parent_id: "c1",
        author_username: "ada",
        author_display_name: "Ada Lovelace",
        body: "first reply",
        created_at: "2026-01-01T00:00:01.000Z",
      }),
      mk("r2", {
        parent_id: "r1",
        author_username: "cat",
        author_display_name: "Cat Grant",
        body: "nested reply",
        created_at: "2026-01-01T00:00:02.000Z",
      }),
    ]);
    render(<CommentsSection videoId="v1" />);

    const toggle = await screen.findByRole("button", { name: "View 2 replies" });
    fireEvent.click(toggle);
    const replies = screen.getByRole("list", { name: "Replies" });

    // r2 answers r1, so it leads with "@ada" (r1's author) in the same paragraph.
    const nested = within(replies).getByText("nested reply");
    expect(nested.textContent).toBe("@ada nested reply");
    // r1 answers the top-level comment directly → no mention (would be redundant).
    const direct = within(replies).getByText("first reply");
    expect(direct.textContent).toBe("first reply");
  });

  it("renders no broken @ when a reply's parent is tombstoned", async () => {
    session = { status: "anon" };
    resolveComments([
      mk("c1", { author_username: "bob", body: "top level" }),
      mk("r1", {
        parent_id: "c1",
        deleted: true,
        body: "[deleted]",
        created_at: "2026-01-01T00:00:01.000Z",
      }),
      mk("r2", {
        parent_id: "r1",
        author_username: "cat",
        body: "nested reply",
        created_at: "2026-01-01T00:00:02.000Z",
      }),
    ]);
    render(<CommentsSection videoId="v1" />);

    const toggle = await screen.findByRole("button", { name: "View 2 replies" });
    fireEvent.click(toggle);
    const replies = screen.getByRole("list", { name: "Replies" });

    const nested = within(replies).getByText("nested reply");
    expect(nested.textContent).toBe("nested reply");
    expect(within(replies).queryByText("@", { exact: false })).toBeNull();
  });
});

describe("CommentsSection per-video comment policy (config-parity W9)", () => {
  it("replaces the composer with a note when comments are disabled, keeping the list readable", async () => {
    resolveComments([mk("c1", { body: "still visible" })]);
    render(<CommentsSection videoId="v1" commentsEnabled={false} />);

    // Existing comments keep rendering (reading stays open server-side too)…
    expect(await screen.findByText("still visible")).toBeTruthy();
    // …but the composer is gone, replaced by the quiet policy note.
    expect(screen.queryByLabelText("Add a comment")).toBeNull();
    expect(screen.getByText("Comments are turned off for this video.")).toBeTruthy();
  });

  it("keeps the composer when comments are enabled (and by default)", async () => {
    resolveComments([]);
    render(<CommentsSection videoId="v1" commentsEnabled />);

    expect(await screen.findByLabelText("Add a comment")).toBeTruthy();
    expect(screen.queryByText("Comments are turned off for this video.")).toBeNull();
  });
});
