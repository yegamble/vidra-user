// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSystemStatus: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, getSystemStatus: mocks.getSystemStatus },
  };
});

import { StatusPanel } from "./AdminSystemStatusView";

function systemStatus(database?: {
  pool_total_conns: number;
  pool_idle_conns: number;
  pool_acquired_conns: number;
  pool_max_conns: number;
}) {
  return {
    status: "ok" as const,
    software: {
      name: "vidra",
      version: "0.5.0",
      commit: "abc1234",
      build_date: "2026-08-28",
      go_version: "go1.25",
    },
    environment: "production" as const,
    uptime_seconds: 900,
    components: { postgres: { status: "ok" } },
    rate_limits: { enabled: true, requests: 300, auth_requests: 30, window_seconds: 60 },
    ...(database === undefined ? {} : { database }),
  };
}

beforeEach(() => {
  mocks.getSystemStatus.mockResolvedValue(systemStatus());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StatusPanel database pool", () => {
  it("omits the section entirely when the server reports no pool", async () => {
    render(<StatusPanel />);

    // The dependency list still lands, so this is "rendered without it", not
    // "not rendered yet".
    expect(await screen.findByText("postgres")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Database pool" })).toBeNull();
    // The failure this guards: a 0/0 pool painted as a real reading, which is
    // indistinguishable from a pool with nothing left.
    expect(screen.queryByText("0 of 0")).toBeNull();
  });

  it("reports the four pool counts when the server samples a pool", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus({
        pool_total_conns: 7,
        pool_idle_conns: 2,
        pool_acquired_conns: 5,
        pool_max_conns: 10,
      }),
    );
    render(<StatusPanel />);

    const section = await screen.findByRole("region", { name: "Database pool" });
    const pool = within(section);
    expect(pool.getByText("5 of 10")).toBeTruthy();
    expect(pool.getByText("2")).toBeTruthy();
    expect(pool.getByText("7")).toBeTruthy();
    // Healthy pool: no saturation hint, and so nowhere to send anyone.
    expect(section.textContent).not.toContain("checked out");
    expect(pool.queryByRole("link")).toBeNull();
  });

  it("warns when every connection is checked out", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus({
        pool_total_conns: 10,
        pool_idle_conns: 0,
        pool_acquired_conns: 10,
        pool_max_conns: 10,
      }),
    );
    render(<StatusPanel />);

    const section = await screen.findByRole("region", { name: "Database pool" });
    const pool = within(section);
    expect(pool.getByText("10 of 10")).toBeTruthy();
    expect(section.textContent).toContain("next query waits for one to come back");
    // The hint names a next move and links at the page carrying the ceiling.
    expect(pool.getByRole("link", { name: "pool limit" }).getAttribute("href")).toBe(
      "/admin/infrastructure",
    );
  });
});
