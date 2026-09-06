// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// The overflow menu launches the report dialog + toast + router; those flows are
// covered elsewhere. Stub the leaf dialog, the toast provider hook and the
// router so the composer + mention render in isolation.
vi.mock("@/components/ReportButton", () => ({ ReportDialog: () => null }));
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
}));
// E2EE availability stays stubbed (the real hook is covered in
// lib/e2ee/availability.test.tsx) but is now SETTABLE. Pinned at a constant
// `false`, this mock could never observe the encrypted item appearing at all —
// so it could not have caught a regression that offered it wrongly.
const e2ee = vi.hoisted(() => ({ available: false as boolean | null }));
vi.mock("@/lib/e2ee/availability", () => ({ useE2EEAvailable: () => e2ee.available }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const getVideoComments = vi.fn();
const postComment = vi.fn();
const deleteComment = vi.fn();
const pinComment = vi.fn();
const unpinComment = vi.fn();
const heartComment = vi.fn();
const unheartComment = vi.fn();
const muteAccount = vi.fn();
const blockUser = vi.fn();
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    getVideoComments: (...args: unknown[]) => getVideoComments(...args),
    postComment: (...args: unknown[]) => postComment(...args),
    deleteComment: (...args: unknown[]) => deleteComment(...args),
    pinComment: (...args: unknown[]) => pinComment(...args),
    unpinComment: (...args: unknown[]) => unpinComment(...args),
    heartComment: (...args: unknown[]) => heartComment(...args),
    unheartComment: (...args: unknown[]) => unheartComment(...args),
    muteAccount: (...args: unknown[]) => muteAccount(...args),
    blockUser: (...args: unknown[]) => blockUser(...args),
  },
  errorMessage: (_err: unknown, fallback: string) => fallback,
  userAvatarUrl: (id: string) => `/avatar/${id}`,
  // Pulled in by the shared instance-features store behind the messaging gate.
  getInstanceCached: vi.fn(() => new Promise(() => {})),
  invalidateInstanceCache: vi.fn(),
}));

import { setInstanceFeaturesForTests } from "@/lib/instance-features";

import { CommentsSection } from "./CommentsSection";

function features(overrides: Record<string, unknown> = {}) {
  return { uploads: true, comments: true, ...overrides } as never;
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
    pinned: false,
    hearted: false,
    ...overrides,
  };
}

function resolveComments(comments: Comment[]) {
  getVideoComments.mockResolvedValue({ comments, limit: 100, offset: 0 });
}

afterEach(() => {
  cleanup();
  setInstanceFeaturesForTests(null);
  vi.clearAllMocks();
});

beforeEach(() => {
  session = { status: "authed", user: { username: "viewer" } };
  e2ee.available = false;
  muteAccount.mockResolvedValue(undefined);
  blockUser.mockResolvedValue(undefined);
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

describe("CommentsSection creator pin + heart", () => {
  // Open a specific comment row's overflow menu by its body text. The trigger
  // lives inside the row; the menu itself portals to <body>, so menu items are
  // queried at the document (screen) level once open.
  async function openMenuFor(body: string) {
    const row = (await screen.findByText(body)).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Comment actions" }));
    return row;
  }

  it("renders the Pinned badge and the creator-heart badge (all viewers)", async () => {
    session = { status: "anon" };
    resolveComments([
      mk("c1", { body: "pinned one", pinned: true }),
      mk("c2", { body: "hearted one", hearted: true }),
    ]);
    render(<CommentsSection videoId="v1" />);

    // Pinned marker: visible text + an accessible title.
    const pinnedBadge = await screen.findByTitle("Pinned by creator");
    expect(pinnedBadge.textContent).toContain("Pinned");
    // Hearted marker: a filled heart carrying its own accessible name.
    expect(screen.getByRole("img", { name: "Hearted by creator" })).toBeTruthy();
    // The un-pinned / un-hearted comment carries neither marker.
    const heartedRow = screen.getByText("hearted one").closest("li") as HTMLElement;
    expect(within(heartedRow).queryByTitle("Pinned by creator")).toBeNull();
  });

  it("suppresses both badges on a tombstoned (deleted) comment", async () => {
    session = { status: "anon" };
    // A tombstone the backend would never actually flag pinned/hearted; assert
    // the [deleted] row shows neither marker regardless.
    resolveComments([mk("c1", { body: "[deleted]", deleted: true, pinned: true, hearted: true })]);
    render(<CommentsSection videoId="v1" />);

    expect(await screen.findByText("[deleted]")).toBeTruthy();
    expect(screen.queryByTitle("Pinned by creator")).toBeNull();
    expect(screen.queryByRole("img", { name: "Hearted by creator" })).toBeNull();
  });

  it("does NOT offer creator actions when the viewer cannot manage comments", async () => {
    // An authed non-owner viewer still gets the moderation kebab, but no Pin/Heart.
    resolveComments([mk("c1", { body: "someone's comment", author_username: "bob" })]);
    render(<CommentsSection videoId="v1" canManageComments={false} />);

    await openMenuFor("someone's comment");
    expect(screen.queryByRole("menuitem", { name: "Pin" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Heart" })).toBeNull();
    // The existing moderation actions are still there ("Report" matches exactly,
    // not "Report user", since a role name string is a full match).
    expect(screen.getByRole("menuitem", { name: "Report" })).toBeTruthy();
  });

  it("offers Pin + Heart to a viewer who can manage comments", async () => {
    resolveComments([mk("c1", { body: "top level", author_username: "bob" })]);
    render(<CommentsSection videoId="v1" canManageComments />);

    await openMenuFor("top level");
    expect(screen.getByRole("menuitem", { name: "Pin" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Heart" })).toBeTruthy();
  });

  it("pins a comment: calls the client, hoists it to the front, and swaps the badge", async () => {
    // c1 first, c2 second (API newest-first order). The owner pins c2.
    resolveComments([
      mk("c1", { body: "first comment", author_username: "bob" }),
      mk("c2", { body: "second comment", author_username: "cat" }),
    ]);
    pinComment.mockResolvedValue(mk("c2", { body: "second comment", author_username: "cat", pinned: true }));
    render(<CommentsSection videoId="v1" canManageComments />);

    await openMenuFor("second comment");
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin" }));

    await waitFor(() => expect(pinComment).toHaveBeenCalledWith("c2"));
    // The pinned comment now carries the badge…
    const pinnedRow = (await screen.findByTitle("Pinned by creator")).closest("li") as HTMLElement;
    expect(pinnedRow.textContent).toContain("second comment");
    // …and it is hoisted to the front so the derived order matches the server's
    // pinned-first ordering (no refetch).
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")[0].textContent).toContain("second comment"),
    );
  });

  it("hearts a comment: calls the client and shows the creator-heart badge", async () => {
    resolveComments([mk("c1", { body: "nice comment", author_username: "bob" })]);
    heartComment.mockResolvedValue(mk("c1", { body: "nice comment", author_username: "bob", hearted: true }));
    render(<CommentsSection videoId="v1" canManageComments />);

    await openMenuFor("nice comment");
    fireEvent.click(screen.getByRole("menuitem", { name: "Heart" }));

    await waitFor(() => expect(heartComment).toHaveBeenCalledWith("c1"));
    expect(await screen.findByRole("img", { name: "Hearted by creator" })).toBeTruthy();
    // The menu now offers Unheart on the hearted comment.
    await openMenuFor("nice comment");
    expect(screen.getByRole("menuitem", { name: "Unheart" })).toBeTruthy();
  });

  it("offers no Pin on a reply, but still allows Heart there", async () => {
    resolveComments([
      mk("c1", { body: "root comment", author_username: "bob" }),
      mk("r1", {
        parent_id: "c1",
        body: "a reply",
        author_username: "cat",
        created_at: "2026-01-01T00:00:01.000Z",
      }),
    ]);
    render(<CommentsSection videoId="v1" canManageComments />);

    // Expand the reply thread, then open the reply's own menu.
    fireEvent.click(await screen.findByRole("button", { name: "View 1 reply" }));
    await openMenuFor("a reply");
    expect(screen.queryByRole("menuitem", { name: "Pin" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Heart" })).toBeTruthy();
  });

  it("offers no controls at all on a deleted comment", async () => {
    resolveComments([mk("c1", { body: "[deleted]", deleted: true })]);
    render(<CommentsSection videoId="v1" canManageComments />);

    expect(await screen.findByText("[deleted]")).toBeTruthy();
    // A tombstone renders no action menu, so no Pin/Heart path exists.
    expect(screen.queryByRole("button", { name: "Comment actions" })).toBeNull();
  });
});

describe("CommentsSection contact actions under the instance messaging gate", () => {
  async function openMenuFor(body: string) {
    const row = (await screen.findByText(body)).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Comment actions" }));
    return row;
  }

  it("drops Message and Encrypted message when the instance discloses messaging: false", async () => {
    setInstanceFeaturesForTests(features({ messaging: false }));
    e2ee.available = true; // even if E2EE were somehow still advertised
    resolveComments([mk("c1", { body: "bob's comment", author_username: "bob" })]);
    render(<CommentsSection videoId="v1" />);

    await openMenuFor("bob's comment");
    expect(screen.queryByRole("menuitem", { name: "Message" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Encrypted message" })).toBeNull();
    // The rest of the contact menu is untouched — this gate is about messaging,
    // not about muting, blocking or reporting.
    expect(screen.getByRole("menuitem", { name: "Mute" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Block" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Report user" })).toBeTruthy();
  });

  it("drops only Encrypted message when E2EE alone is unavailable", async () => {
    setInstanceFeaturesForTests(features({ messaging: true }));
    e2ee.available = false;
    resolveComments([mk("c1", { body: "bob's comment", author_username: "bob" })]);
    render(<CommentsSection videoId="v1" />);

    await openMenuFor("bob's comment");
    expect(screen.getByRole("menuitem", { name: "Message" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Encrypted message" })).toBeNull();
  });

  // Counter-tests: both disclosed on, and a core too old to disclose either.
  it("offers both when messaging and E2EE are available", async () => {
    setInstanceFeaturesForTests(features({ messaging: true }));
    e2ee.available = true;
    resolveComments([mk("c1", { body: "bob's comment", author_username: "bob" })]);
    render(<CommentsSection videoId="v1" />);

    await openMenuFor("bob's comment");
    expect(screen.getByRole("menuitem", { name: "Message" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Encrypted message" })).toBeTruthy();
  });

  it("offers Message when the field is absent (a core that predates the disclosure)", async () => {
    setInstanceFeaturesForTests(features());
    resolveComments([mk("c1", { body: "bob's comment", author_username: "bob" })]);
    render(<CommentsSection videoId="v1" />);

    await openMenuFor("bob's comment");
    expect(screen.getByRole("menuitem", { name: "Message" })).toBeTruthy();
  });
});


describe("CommentsSection deletion recovery", () => {
  it("keeps a failed deletion visible, explains the failure, and retries only on demand", async () => {
    resolveComments([mk("c1", { body: "keep until confirmed", author_username: "viewer" })]);
    deleteComment.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<CommentsSection videoId="v1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not delete your comment. Please try again.");
    expect(screen.getByText("keep until confirmed")).toBeTruthy();
    expect(deleteComment).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(false);

    let finish!: () => void;
    deleteComment.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("keep until confirmed")).toBeTruthy();
    finish();
    await waitFor(() => expect(screen.queryByText("keep until confirmed")).toBeNull());
    expect(deleteComment).toHaveBeenCalledTimes(2);
    expect(deleteComment).toHaveBeenLastCalledWith("c1");
  });
});

describe("CommentsSection viewer-scoped filtering (A12 / SOC-02)", () => {
  // The comment list's mute/block filtering is PER VIEWER and applied by the
  // server: GET /videos/{id}/comments only knows who is asking if the request
  // carries the viewer's token. Fetching while the session is still being
  // restored sends the request anonymously, so the server hides nothing and the
  // muted account's comments come back on every hard page load — the mute looks
  // like it works only for as long as the client-side filter survives.
  it("does not request the list until the session has resolved", async () => {
    session = { status: "restoring" };
    resolveComments([mk("c1")]);
    const { rerender } = render(<CommentsSection videoId="v1" />);

    // Nothing may go out yet: an anonymous read is the wrong read, not an early one.
    await waitFor(() => expect(screen.getByLabelText("Loading comments")).toBeTruthy());
    expect(getVideoComments).not.toHaveBeenCalled();

    session = { status: "authed", user: { username: "viewer" } };
    rerender(<CommentsSection videoId="v1" />);
    await screen.findByText("body-c1");
    expect(getVideoComments).toHaveBeenCalledTimes(1);
  });

  it("fetches once for an anonymous visitor, after the restore attempt settles", async () => {
    session = { status: "restoring" };
    resolveComments([mk("c1")]);
    const { rerender } = render(<CommentsSection videoId="v1" />);
    expect(getVideoComments).not.toHaveBeenCalled();

    session = { status: "anon" };
    rerender(<CommentsSection videoId="v1" />);
    await screen.findByText("body-c1");
    expect(getVideoComments).toHaveBeenCalledTimes(1);
  });
});

// Block and Mute sit in the same overflow menu, and the server treats them the
// same way for comments: blockUser's contract is "their comments are filtered
// from comment lists, per-viewer, exactly like mutes", so the row is gone on
// the next load either way. Only the SPOT behaviour differed — Mute removed
// the comment, Block left it in place reading "Blocked" — which asked the
// reader to believe two controls with the same effect had different ones.
// The owner has ruled that Block removes it too.
describe("CommentsSection block removes the author's comments at once", () => {
  async function openMenuFor(body: string) {
    const row = (await screen.findByText(body)).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Comment actions" }));
    return row;
  }

  it("removes every comment by the blocked author, and nobody else's", async () => {
    resolveComments([
      mk("c1", { body: "bob first", author_id: "u-bob", author_username: "bob" }),
      mk("c2", { body: "bob second", author_id: "u-bob", author_username: "bob" }),
      mk("c3", { body: "alice speaks", author_id: "u-alice", author_username: "alice" }),
    ]);
    render(<CommentsSection videoId="v1" />);

    await openMenuFor("bob first");
    fireEvent.click(screen.getByRole("menuitem", { name: "Block" }));

    await waitFor(() => expect(blockUser).toHaveBeenCalledWith("u-bob"));
    await waitFor(() => expect(screen.queryByText("bob first")).toBeNull());
    expect(screen.queryByText("bob second")).toBeNull();
    expect(screen.getByText("alice speaks")).toBeTruthy();
  });

  it("matches what Mute already does, so the two controls read alike", async () => {
    resolveComments([
      mk("c1", { body: "bob first", author_id: "u-bob", author_username: "bob" }),
      mk("c3", { body: "alice speaks", author_id: "u-alice", author_username: "alice" }),
    ]);
    render(<CommentsSection videoId="v1" />);

    await openMenuFor("bob first");
    fireEvent.click(screen.getByRole("menuitem", { name: "Mute" }));

    await waitFor(() => expect(muteAccount).toHaveBeenCalledWith("u-bob"));
    await waitFor(() => expect(screen.queryByText("bob first")).toBeNull());
    expect(screen.getByText("alice speaks")).toBeTruthy();
  });

  it("leaves the comment in place when the block request fails", async () => {
    blockUser.mockRejectedValue(new Error("network"));
    resolveComments([mk("c1", { body: "bob first", author_id: "u-bob", author_username: "bob" })]);
    render(<CommentsSection videoId="v1" />);

    await openMenuFor("bob first");
    fireEvent.click(screen.getByRole("menuitem", { name: "Block" }));

    await waitFor(() => expect(blockUser).toHaveBeenCalled());
    expect(screen.getByText("bob first")).toBeTruthy();
  });
});
