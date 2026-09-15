// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthoredRemoteComment, RemoteVideoComment } from "@/lib/api";

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

// The real useSettledSession runs against this mocked useSession — that is the
// seam this component uses to wait for the token before the (viewer-filtered)
// read, so exercising it for real is the point.
let session: { status: string; user?: { id: string; username: string; role?: string } | null };
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => session }));

// Hoisted so the vi.mock factory (itself hoisted above the imports) can close
// over them without a temporal-dead-zone error.
const h = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`status ${status}`);
      this.status = status;
    }
  }
  return {
    MockApiError,
    getRemoteVideoComments: vi.fn(),
    createRemoteVideoComment: vi.fn(),
    updateRemoteVideoComment: vi.fn(),
    deleteRemoteVideoComment: vi.fn(),
  };
});
const {
  MockApiError,
  getRemoteVideoComments,
  createRemoteVideoComment,
  updateRemoteVideoComment,
  deleteRemoteVideoComment,
} = h;
vi.mock("@/lib/api", () => ({
  ApiError: h.MockApiError,
  api: {
    getRemoteVideoComments: (...a: unknown[]) => h.getRemoteVideoComments(...a),
    createRemoteVideoComment: (...a: unknown[]) => h.createRemoteVideoComment(...a),
    updateRemoteVideoComment: (...a: unknown[]) => h.updateRemoteVideoComment(...a),
    deleteRemoteVideoComment: (...a: unknown[]) => h.deleteRemoteVideoComment(...a),
  },
  errorMessage: (_err: unknown, fallback: string) => fallback,
  userAvatarUrl: (id: string) => `/avatar/${id}`,
}));

import { RemoteVideoComments } from "./RemoteVideoComments";

function mirrored(id: string, overrides: Partial<RemoteVideoComment> = {}): RemoteVideoComment {
  return {
    id,
    local: false,
    author_name: `remote-${id}`,
    author_domain: "peer.example",
    actor_url: `https://peer.example/accounts/${id}`,
    object_url: `https://peer.example/notes/${id}`,
    body: `mirrored-${id}`,
    edited: false,
    created_at: "2026-09-05T10:00:00Z",
    ...overrides,
  };
}

function authored(id: string, overrides: Partial<AuthoredRemoteComment> = {}): AuthoredRemoteComment {
  return {
    id,
    remote_video_id: "v1",
    local: true,
    author_id: "u-me",
    author_username: "me",
    author_display_name: "Me",
    body: `authored-${id}`,
    object_url: `https://home.example/notes/${id}`,
    in_reply_to: "https://peer.example/videos/1",
    delivery_state: "pending",
    edited: false,
    created_at: "2026-09-05T09:00:00Z",
    updated_at: "2026-09-05T09:00:00Z",
    ...overrides,
  };
}

function resolve(comments: RemoteVideoComment[], authoredList: AuthoredRemoteComment[]) {
  getRemoteVideoComments.mockResolvedValue({
    comments,
    authored: authoredList,
    total: comments.length,
    limit: 100,
    offset: 0,
  });
}

beforeEach(() => {
  session = { status: "authed", user: { id: "u-me", username: "me", role: "user" } };
  getRemoteVideoComments.mockReset();
  createRemoteVideoComment.mockReset();
  updateRemoteVideoComment.mockReset();
  deleteRemoteVideoComment.mockReset();
});

afterEach(cleanup);

describe("RemoteVideoComments — authored vs mirrored", () => {
  it("shows authored (local) and mirrored (origin) comments under distinct headings, only authored badged", async () => {
    resolve([mirrored("m1")], [authored("a1", { delivery_state: "delivered" })]);
    render(<RemoteVideoComments videoId="v1" domain="peer.example" />);

    const localHeading = await screen.findByRole("heading", { name: "Replies from this instance" });
    const originHeading = screen.getByRole("heading", { name: "Comments from the origin" });

    // Both bodies render.
    expect(screen.getByText("authored-a1")).toBeTruthy();
    expect(screen.getByText("mirrored-m1")).toBeTruthy();

    // The authored section carries a delivery badge; the mirrored one never does.
    const localSection = localHeading.closest("section") as HTMLElement;
    const originSection = originHeading.closest("section") as HTMLElement;
    expect(within(localSection).getByRole("status", { name: /Delivery to origin/ })).toBeTruthy();
    expect(within(originSection).queryByRole("status", { name: /Delivery to origin/ })).toBeNull();
  });

  it("renders a per-state delivery badge and surfaces last_error on a failed authored comment", async () => {
    resolve(
      [],
      [authored("a1", { delivery_state: "failed", last_error: "destination is blocked" })],
    );
    render(<RemoteVideoComments videoId="v1" domain="peer.example" />);

    expect(await screen.findByText("Failed")).toBeTruthy();
    // The reason is legible without a hover, not only in the badge title.
    expect(screen.getByText(/Delivery to the origin failed: destination is blocked/)).toBeTruthy();
  });
});

describe("RemoteVideoComments — authoring", () => {
  it("authors a comment against this instance and prepends it with a pending badge", async () => {
    resolve([], []);
    createRemoteVideoComment.mockResolvedValue(authored("new", { body: "my reply", delivery_state: "pending" }));
    render(<RemoteVideoComments videoId="v1" domain="peer.example" />);

    const box = await screen.findByRole("textbox", { name: "Add a comment" });
    fireEvent.change(box, { target: { value: "my reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() => expect(createRemoteVideoComment).toHaveBeenCalledWith("v1", "my reply"));
    expect(await screen.findByText("my reply")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("surfaces a 403 as comments being disabled on this instance", async () => {
    resolve([], []);
    createRemoteVideoComment.mockRejectedValue(new MockApiError(403));
    render(<RemoteVideoComments videoId="v1" domain="peer.example" />);

    const box = await screen.findByRole("textbox", { name: "Add a comment" });
    fireEvent.change(box, { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByText(/New comments are turned off on this instance/)).toBeTruthy();
  });

  it("shows an anonymous viewer a sign-in prompt instead of a composer", async () => {
    session = { status: "anon", user: null };
    resolve([], []);
    render(<RemoteVideoComments videoId="v1" domain="peer.example" />);

    await screen.findByRole("heading", { name: "Comments from the origin" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });
});

describe("RemoteVideoComments — edit & delete", () => {
  it("lets the author edit their own authored comment", async () => {
    resolve([], [authored("a1", { body: "before" })]);
    updateRemoteVideoComment.mockResolvedValue(authored("a1", { body: "after", edited: true }));
    render(<RemoteVideoComments videoId="v1" domain="peer.example" />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const edit = screen.getByRole("textbox", { name: "Edit comment" });
    fireEvent.change(edit, { target: { value: "after" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateRemoteVideoComment).toHaveBeenCalledWith("a1", "after"));
    expect(await screen.findByText("after")).toBeTruthy();
  });

  it("lets the author delete their own authored comment", async () => {
    resolve([], [authored("a1", { body: "goodbye" })]);
    deleteRemoteVideoComment.mockResolvedValue(undefined);
    render(<RemoteVideoComments videoId="v1" domain="peer.example" />);

    expect(await screen.findByText("goodbye")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteRemoteVideoComment).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(screen.queryByText("goodbye")).toBeNull());
  });

  it("offers no edit/delete on another local user's authored comment to a plain viewer", async () => {
    resolve([], [authored("a1", { author_id: "someone-else", author_username: "other" })]);
    render(<RemoteVideoComments videoId="v1" domain="peer.example" />);

    expect(await screen.findByText("authored-a1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("lets a moderator delete (not edit) another user's authored comment", async () => {
    session = { status: "authed", user: { id: "u-mod", username: "mod", role: "moderator" } };
    resolve([], [authored("a1", { author_id: "someone-else", author_username: "other" })]);
    deleteRemoteVideoComment.mockResolvedValue(undefined);
    render(<RemoteVideoComments videoId="v1" domain="peer.example" />);

    expect(await screen.findByText("authored-a1")).toBeTruthy();
    // A moderator removes, it does not edit (the contract's rule).
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteRemoteVideoComment).toHaveBeenCalledWith("a1"));
  });
});

describe("RemoteVideoComments — states", () => {
  it("shows an error state with retry when the load fails", async () => {
    getRemoteVideoComments.mockRejectedValue(new Error("boom"));
    render(<RemoteVideoComments videoId="v1" domain="peer.example" />);

    expect(await screen.findByText(/Could not load the comments for this video/)).toBeTruthy();
    // The composer still renders for a signed-in viewer above the error.
    expect(screen.getByRole("textbox", { name: "Add a comment" })).toBeTruthy();
  });
});
