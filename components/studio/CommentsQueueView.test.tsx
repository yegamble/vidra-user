// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listManagedComments: vi.fn(),
  approveComment: vi.fn(),
  deleteComment: vi.fn(),
}));

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/lib/api", () => ({
  api: mocks,
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { CommentsQueueView } from "@/components/studio/CommentsQueueView";
import { navigation } from "@/lib/test-navigation";

function entry(id: string, held: boolean) {
  return {
    id,
    video_id: `v-${id}`,
    video_title: `Clip ${id}`,
    body: `body ${id}`,
    parent_id: null,
    author_id: "eve-id",
    author_username: "eve",
    author_display_name: "Eve",
    remote: false,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    edited: false,
    deleted: false,
    pinned: false,
    hearted: false,
    held_for_review: held,
  };
}

function page(items: ReturnType<typeof entry>[]) {
  return { comments: items, total: items.length, limit: 10, offset: 0 };
}

beforeEach(() => {
  navigation.reset("/studio/comments");
  for (const m of Object.values(mocks)) m.mockReset();
});
afterEach(cleanup);

describe("CommentsQueueView", () => {
  it("opens on the comments awaiting approval across the creator's videos", async () => {
    mocks.listManagedComments.mockResolvedValue(page([entry("a", true)]));
    render(<CommentsQueueView />);
    expect(await screen.findByText("body a")).toBeTruthy();
    expect(mocks.listManagedComments.mock.calls[0][0]).toMatchObject({ held: true, offset: 0 });
    expect(screen.getByRole("link", { name: "Clip a" }).getAttribute("href")).toBe("/videos/v-a");
    expect(screen.getByText("Pending approval")).toBeTruthy();
  });

  it("approves a held comment and drops it from the queue", async () => {
    mocks.listManagedComments.mockResolvedValue(page([entry("a", true), entry("b", true)]));
    mocks.approveComment.mockResolvedValue(entry("a", false));
    render(<CommentsQueueView />);
    await screen.findByText("body a");
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]);
    await waitFor(() => expect(mocks.approveComment).toHaveBeenCalledWith("v-a", "a"));
    await waitFor(() => expect(screen.queryByText("body a")).toBeNull());
    expect(screen.getByText("body b")).toBeTruthy();
  });

  it("rejects (deletes) a held comment after confirmation", async () => {
    mocks.listManagedComments.mockResolvedValue(page([entry("a", true)]));
    mocks.deleteComment.mockResolvedValue(undefined);
    render(<CommentsQueueView />);
    await screen.findByText("body a");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(mocks.deleteComment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject" }));
    await waitFor(() => expect(mocks.deleteComment).toHaveBeenCalledWith("a"));
    await waitFor(() => expect(screen.queryByText("body a")).toBeNull());
  });

  it("switches to every comment, where a published one offers no Approve", async () => {
    mocks.listManagedComments.mockResolvedValue(page([entry("a", true)]));
    render(<CommentsQueueView />);
    await screen.findByText("body a");
    mocks.listManagedComments.mockResolvedValue(page([entry("p", false)]));
    fireEvent.click(screen.getByRole("button", { name: "All comments" }));
    expect(await screen.findByText("body p")).toBeTruthy();
    const last = mocks.listManagedComments.mock.calls.at(-1)?.[0];
    expect(last).not.toHaveProperty("held", true);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByText("Pending approval")).toBeNull();
  });
});
