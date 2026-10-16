// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getNotifications: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "authed" }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...p}>{children}</a>
  ),
}));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: {
    getNotifications: mocks.getNotifications,
    markNotificationRead: mocks.markNotificationRead,
    markAllNotificationsRead: vi.fn(),
  },
}));

import { NotificationsView } from "./NotificationsView";

const rows = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `n${from + i}`,
    type: "comment",
    read: false,
    created_at: "2026-10-01T00:00:00Z",
    data: { video_title: `Clip ${from + i}`, actor_name: "Bob", video_id: "v" },
  }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.markNotificationRead.mockResolvedValue(undefined);
  mocks.getNotifications.mockImplementation((p: { offset?: number }) =>
    Promise.resolve(
      p.offset
        ? { notifications: rows(20, 2), total: 22, unread_count: 22, limit: 20, offset: 20 }
        : { notifications: rows(0, 20), total: 22, unread_count: 22, limit: 20, offset: 0 },
    ),
  );
});
afterEach(cleanup);

describe("NotificationsView paging", () => {
  it("loads page 2 at offset 20, stops at the total, and keeps the account-wide unread state", async () => {
    render(<NotificationsView />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(20));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(22));
    expect(mocks.getNotifications).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 20, offset: 20 }),
      expect.anything(),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    // Mark-all stays enabled off the SERVER's unread_count, not the loaded rows.
    expect((screen.getByRole("button", { name: "Mark all as read" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("marking one read on page 2 still works and the pager stays correct", async () => {
    render(<NotificationsView />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(20));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(22));
    fireEvent.click(screen.getAllByRole("button", { name: "Mark as read" })[21]);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(21));
    expect(mocks.markNotificationRead).toHaveBeenCalledWith("n21");
  });
});
