// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getBlockedInstances: vi.fn(), useSession: vi.fn() }));

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => mocks.useSession() }));
vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, getBlockedInstances: mocks.getBlockedInstances } };
});

import { AdminInstancesView } from "./AdminInstancesView";

beforeEach(() => {
  mocks.useSession.mockReturnValue({ status: "authed", user: { id: "m1", role: "moderator" } });
});
afterEach(cleanup);

describe("AdminInstancesView source", () => {
  it("flags a subscription-owned block and leaves a manual one plain", async () => {
    mocks.getBlockedInstances.mockResolvedValue({
      instances: [
        { domain: "listed.example", reason: "", blocked_at: "2026-10-01T12:00:00Z", source: "subscription:1111" },
        { domain: "mine.example", reason: "", blocked_at: "2026-10-01T12:00:00Z", source: "manual" },
      ],
      total: 2,
      limit: 10,
      offset: 0,
    });
    render(<AdminInstancesView />);
    await screen.findByText("listed.example");
    expect(screen.getAllByText(/Added by a blocklist subscription/)).toHaveLength(1);
  });

  it("treats a row with no source (older core / mocked fixture) as manual instead of crashing", async () => {
    mocks.getBlockedInstances.mockResolvedValue({
      instances: [{ domain: "old.example", reason: "long gone", blocked_at: "2026-10-01T12:00:00Z" }],
      total: 1,
      limit: 10,
      offset: 0,
    });
    render(<AdminInstancesView />);
    await screen.findByText("old.example");
    expect(screen.queryByText(/Added by a blocklist subscription/)).toBeNull();
  });
});
