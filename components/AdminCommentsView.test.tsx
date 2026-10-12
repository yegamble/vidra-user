// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminComment } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  getAdminComments: vi.fn(),
  deleteComment: vi.fn(),
  bulkRemoveAdminComments: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock(
  "next/navigation",
  async () => (await import("@/lib/test-navigation")).navigationMock,
);
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => mocks.useSession(),
}));
vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getAdminComments: mocks.getAdminComments,
      deleteComment: mocks.deleteComment,
      bulkRemoveAdminComments: mocks.bulkRemoveAdminComments,
    },
  };
});

import { ApiError } from "@/lib/api";
import { AdminCommentsView } from "./AdminCommentsView";

function comment(overrides: Partial<AdminComment> = {}): AdminComment {
  return {
    id: "c1",
    video_id: "v1",
    video_title: "Clip",
    body: "buy pills",
    author_username: "spammer",
    author_display_name: "Spam Bot",
    remote: false,
    created_at: "2026-10-01T12:00:00Z",
    deleted: false,
    ...overrides,
  } as AdminComment;
}

function page(comments: AdminComment[]) {
  return { comments, total: comments.length, limit: 10, offset: 0 };
}

beforeEach(() => {
  mocks.getAdminComments.mockReset().mockResolvedValue(page([comment()]));
  mocks.bulkRemoveAdminComments.mockReset().mockResolvedValue({ removed: 3 });
  mocks.useSession.mockReturnValue({
    status: "authed",
    user: { id: "m1", role: "moderator" },
  });
});

afterEach(cleanup);

describe("AdminCommentsView bulk removal", () => {
  it("names the account in the confirmation, posts the username, shows the count and reloads", async () => {
    render(<AdminCommentsView />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Remove all comments by @spammer/,
      }),
    );
    expect(screen.getByText(/every comment by @spammer/i)).toBeTruthy();
    expect(mocks.bulkRemoveAdminComments).not.toHaveBeenCalled();

    mocks.getAdminComments.mockResolvedValue(page([]));
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove all" }));

    await waitFor(() =>
      expect(mocks.bulkRemoveAdminComments).toHaveBeenCalledWith("spammer"),
    );
    expect(
      await screen.findByText(/Removed 3 comments by @spammer/),
    ).toBeTruthy();
    await waitFor(() =>
      expect(mocks.getAdminComments).toHaveBeenCalledTimes(2),
    );
  });

  it("cancel leaves everything untouched", async () => {
    render(<AdminCommentsView />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Remove all comments by @spammer/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.bulkRemoveAdminComments).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Confirm remove all" }),
    ).toBeNull();
  });

  it("surfaces a failure instead of claiming success", async () => {
    mocks.bulkRemoveAdminComments.mockRejectedValue(
      new ApiError({
        status: 404,
        code: "not_found",
        message: "account not found",
      }),
    );
    render(<AdminCommentsView />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Remove all comments by @spammer/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove all" }));
    expect(await screen.findByText(/account not found/)).toBeTruthy();
    expect(screen.queryByText(/Removed/)).toBeNull();
  });

  it("offers no bulk action for a remote author", async () => {
    mocks.getAdminComments.mockResolvedValue(
      page([
        comment({
          remote: true,
          author_domain: "peer.example",
          author_username: "kaisa",
        }),
      ]),
    );
    render(<AdminCommentsView />);
    await screen.findByText("buy pills");
    expect(
      screen.queryByRole("button", { name: /Remove all comments by/ }),
    ).toBeNull();
  });

  it("is moderator-gated: a plain user fetches nothing", async () => {
    mocks.useSession.mockReturnValue({
      status: "authed",
      user: { id: "u1", role: "user" },
    });
    render(<AdminCommentsView />);
    expect(mocks.getAdminComments).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Remove all comments by/ }),
    ).toBeNull();
  });
});
