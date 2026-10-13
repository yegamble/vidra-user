// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BlocklistSubscription } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  getBlocklistSubscriptions: vi.fn(),
  createBlocklistSubscription: vi.fn(),
  updateBlocklistSubscription: vi.fn(),
  deleteBlocklistSubscription: vi.fn(),
  syncBlocklistSubscription: vi.fn(),
  getBlocklistAllowlist: vi.fn(),
  addBlocklistAllow: vi.fn(),
  removeBlocklistAllow: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => mocks.useSession() }));
vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getBlocklistSubscriptions: mocks.getBlocklistSubscriptions,
      createBlocklistSubscription: mocks.createBlocklistSubscription,
      updateBlocklistSubscription: mocks.updateBlocklistSubscription,
      deleteBlocklistSubscription: mocks.deleteBlocklistSubscription,
      syncBlocklistSubscription: mocks.syncBlocklistSubscription,
      getBlocklistAllowlist: mocks.getBlocklistAllowlist,
      addBlocklistAllow: mocks.addBlocklistAllow,
      removeBlocklistAllow: mocks.removeBlocklistAllow,
    },
  };
});

import { ApiError } from "@/lib/api";
import { AdminBlocklistSubscriptionsView, syncSummary } from "./AdminBlocklistSubscriptionsView";

function sub(o: Partial<BlocklistSubscription> = {}): BlocklistSubscription {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    url: "https://lists.example/block.csv",
    label: "Shared list",
    format: "mastodon_csv",
    enabled: true,
    last_status: "ok",
    last_added: 3,
    last_removed: 1,
    entry_count: 40,
    block_count: 12,
    created_at: "2026-10-01T12:00:00Z",
    last_synced_at: "2026-10-12T12:00:00Z",
    ...o,
  };
}
const subsPage = (items: BlocklistSubscription[]) => ({ subscriptions: items, total: items.length, limit: 10, offset: 0 });
const allowPage = (domains: string[]) => ({
  domains: domains.map((domain) => ({ domain, added_at: "2026-10-01T12:00:00Z" })),
  total: domains.length,
  limit: 10,
  offset: 0,
});

beforeEach(() => {
  mocks.getBlocklistSubscriptions.mockReset().mockResolvedValue(subsPage([]));
  mocks.getBlocklistAllowlist.mockReset().mockResolvedValue(allowPage([]));
  for (const k of ["createBlocklistSubscription", "updateBlocklistSubscription", "deleteBlocklistSubscription", "addBlocklistAllow", "removeBlocklistAllow"] as const) {
    mocks[k].mockReset().mockResolvedValue(undefined);
  }
  mocks.syncBlocklistSubscription.mockReset().mockResolvedValue({
    status: "ok", added: 2, removed: 1, entries: 9, ignored_severity: 4, invalid: 0,
  });
  mocks.useSession.mockReturnValue({ status: "authed", user: { id: "a1", role: "admin" } });
});

afterEach(cleanup);

describe("AdminBlocklistSubscriptionsView", () => {
  it("is admin-only: a moderator sees the permission prompt and nothing fetches", () => {
    mocks.useSession.mockReturnValue({ status: "authed", user: { id: "m1", role: "moderator" } });
    render(<AdminBlocklistSubscriptionsView />);
    expect(mocks.getBlocklistSubscriptions).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Blocklist URL")).toBeNull();
  });

  it("lists a subscription with its status, owned block count and last sync", async () => {
    mocks.getBlocklistSubscriptions.mockResolvedValue(subsPage([sub()]));
    render(<AdminBlocklistSubscriptionsView />);
    expect(await screen.findByText("Shared list")).toBeTruthy();
    expect(screen.getByText("Synced")).toBeTruthy();
    expect(screen.getByText(/12 blocks from this list/)).toBeTruthy();
  });

  it("shows a failed sync's class message and a paused state", async () => {
    mocks.getBlocklistSubscriptions.mockResolvedValue(
      subsPage([sub({ last_status: "error", last_error: "HTTP 503", enabled: false })]),
    );
    render(<AdminBlocklistSubscriptionsView />);
    expect(await screen.findByText("HTTP 503")).toBeTruthy();
    expect(screen.getByText("Last sync failed")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
  });

  it("adds a subscription with the chosen format, then reloads", async () => {
    render(<AdminBlocklistSubscriptionsView />);
    await screen.findByText("No blocklist subscriptions");
    fireEvent.change(screen.getByLabelText("Blocklist URL"), { target: { value: " https://lists.example/a.json " } });
    fireEvent.change(screen.getByLabelText("List format"), { target: { value: "json" } });
    mocks.createBlocklistSubscription.mockResolvedValue(sub({ block_count: 0, last_status: "never" }));
    fireEvent.click(screen.getByRole("button", { name: "Add list" }));
    await waitFor(() =>
      expect(mocks.createBlocklistSubscription).toHaveBeenCalledWith({
        url: "https://lists.example/a.json", label: undefined, format: "json",
      }),
    );
    expect(await screen.findByText("Shared list")).toBeTruthy();
  });

  it("explains a duplicate (409) and an invalid URL (422)", async () => {
    render(<AdminBlocklistSubscriptionsView />);
    await screen.findByText("No blocklist subscriptions");
    fireEvent.change(screen.getByLabelText("Blocklist URL"), { target: { value: "https://x.example/l" } });
    mocks.createBlocklistSubscription.mockRejectedValueOnce(new ApiError({ status: 409, code: "conflict", message: "dup" }));
    fireEvent.click(screen.getByRole("button", { name: "Add list" }));
    expect((await screen.findByRole("alert")).textContent).toContain("already subscribed");
    mocks.createBlocklistSubscription.mockRejectedValueOnce(new ApiError({ status: 422, code: "validation_failed", message: "bad" }));
    fireEvent.click(screen.getByRole("button", { name: "Add list" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("public http(s) URL"));
  });

  it("syncs now and reports added/removed and the ignored severities", async () => {
    mocks.getBlocklistSubscriptions.mockResolvedValue(subsPage([sub()]));
    render(<AdminBlocklistSubscriptionsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync Shared list now" }));
    await waitFor(() => expect(mocks.syncBlocklistSubscription).toHaveBeenCalledWith(sub().id));
    expect(await screen.findByText("Synced: 2 added, 1 removed, 4 ignored (silence/limit).")).toBeTruthy();
    expect(screen.getByText(/13 blocks from this list/)).toBeTruthy();
  });

  it("tells the admin to wait when sync-now is rate limited", async () => {
    mocks.getBlocklistSubscriptions.mockResolvedValue(subsPage([sub()]));
    mocks.syncBlocklistSubscription.mockRejectedValue(new ApiError({ status: 429, code: "rate_limited", message: "slow" }));
    render(<AdminBlocklistSubscriptionsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync Shared list now" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Wait a minute");
  });

  it("pauses a subscription", async () => {
    mocks.getBlocklistSubscriptions.mockResolvedValue(subsPage([sub()]));
    render(<AdminBlocklistSubscriptionsView />);
    mocks.updateBlocklistSubscription.mockResolvedValue(sub({ enabled: false, block_count: 0 }));
    fireEvent.click(await screen.findByRole("button", { name: "Pause Shared list" }));
    expect(await screen.findByText("Paused")).toBeTruthy();
    expect(screen.getByText(/12 blocks from this list/)).toBeTruthy();
    await waitFor(() => expect(mocks.updateBlocklistSubscription).toHaveBeenCalledWith(sub().id, { enabled: false }));
  });

  it("removes only after confirmation, and the confirm names what stays", async () => {
    mocks.getBlocklistSubscriptions.mockResolvedValue(subsPage([sub()]));
    render(<AdminBlocklistSubscriptionsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Shared list" }));
    expect(mocks.deleteBlocklistSubscription).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("Blocks you added by hand stay");
    fireEvent.click(screen.getByRole("button", { name: "Remove list and its blocks" }));
    await waitFor(() => expect(mocks.deleteBlocklistSubscription).toHaveBeenCalledWith(sub().id));
    await waitFor(() => expect(screen.queryByText("Shared list")).toBeNull());
  });

  it("exempts a domain (lowercased) and lifts the exemption", async () => {
    render(<AdminBlocklistSubscriptionsView />);
    await screen.findByText("Nothing exempt");
    fireEvent.change(screen.getByLabelText("Domain to exempt from blocklists"), { target: { value: " Friend.Example " } });
    fireEvent.click(screen.getByRole("button", { name: "Exempt" }));
    await waitFor(() => expect(mocks.addBlocklistAllow).toHaveBeenCalledWith({ domain: "friend.example" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop exempting friend.example" }));
    await waitFor(() => expect(mocks.removeBlocklistAllow).toHaveBeenCalledWith("friend.example"));
  });
});

describe("syncSummary", () => {
  it("covers every status", () => {
    expect(syncSummary({ status: "not_modified", added: 0, removed: 0, entries: 0, ignored_severity: 0, invalid: 0 })).toBe("Already up to date.");
    expect(syncSummary({ status: "error", error: "address not allowed", added: 0, removed: 0, entries: 0, ignored_severity: 0, invalid: 0 })).toBe("Sync failed: address not allowed.");
  });
});
