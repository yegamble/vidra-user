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

function systemStatus(
  database?: {
    pool_total_conns: number;
    pool_idle_conns: number;
    pool_acquired_conns: number;
    pool_max_conns: number;
  },
  // Contract-field overrides (or, set to undefined, omissions — an older
  // backend that predates a field must degrade the section away, not crash).
  overrides: Record<string, unknown> = {},
) {
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
    ...overrides,
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
    expect(await screen.findByText("PostgreSQL")).toBeTruthy();
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
    // The hint promises what the destination delivers: the Infrastructure page
    // is a read-only report of the pool sizing (DB_MAX_CONNS), not a control —
    // "raise the pool limit" would send the operator hunting for a dial that
    // is not there.
    expect(section.textContent).toContain("DB_MAX_CONNS");
    expect(
      pool.getByRole("link", { name: "pool sizing this deployment chose" }).getAttribute("href"),
    ).toBe("/admin/infrastructure");
  });
});

describe("StatusPanel rate limits", () => {
  it("surfaces the applied budgets read-only when rate limiting is on", async () => {
    render(<StatusPanel />);

    const section = await screen.findByRole("region", { name: "Rate limits" });
    const rl = within(section);
    expect(rl.getByText("On")).toBeTruthy();
    expect(rl.getByText("300 requests / 60s per IP")).toBeTruthy();
    expect(rl.getByText("30 requests / 60s per IP")).toBeTruthy();
    // Read-only by decision: rate limits are deploy-time env, so there is no
    // control of any kind here — the section exists to confirm what applied.
    expect(rl.queryByRole("button")).toBeNull();
  });

  it("collapses to a single quiet row when rate limiting is off", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus(undefined, {
        rate_limits: { enabled: false, requests: 0, auth_requests: 0, window_seconds: 0 },
      }),
    );
    render(<StatusPanel />);

    const section = await screen.findByRole("region", { name: "Rate limits" });
    expect(within(section).getByText("Off")).toBeTruthy();
    // A disabled limiter's zeroed budgets are config noise, not facts.
    expect(section.textContent).not.toContain("per IP");
  });

  it("omits the section on a backend that predates the field", async () => {
    mocks.getSystemStatus.mockResolvedValue(systemStatus(undefined, { rate_limits: undefined }));
    render(<StatusPanel />);

    expect(await screen.findByText("PostgreSQL")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Rate limits" })).toBeNull();
  });
});

describe("StatusPanel CDN purge", () => {
  it("omits the section when no CDN is wired — absence is the good news", async () => {
    render(<StatusPanel />);

    expect(await screen.findByText("PostgreSQL")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "CDN purge" })).toBeNull();
  });

  it("reports the purge counters when the block is present", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus(undefined, {
        cdn_purge: { runs: 12, keys_purged: 3400, keys_failed: 0 },
      }),
    );
    render(<StatusPanel />);

    const section = await screen.findByRole("region", { name: "CDN purge" });
    const purge = within(section);
    expect(purge.getByText("12")).toBeTruthy();
    expect(purge.getByText("3400")).toBeTruthy();
    expect(purge.getByText("0")).toBeTruthy();
    // Every run since boot purged its full key set: no incomplete-run marker.
    expect(section.textContent).not.toContain("incomplete");
  });

  it("warns when a purge run last ended incomplete", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus(undefined, {
        cdn_purge: {
          runs: 12,
          keys_purged: 3400,
          keys_failed: 7,
          last_incomplete_run_at: "2026-08-28T10:00:00Z",
        },
      }),
    );
    render(<StatusPanel />);

    const section = await screen.findByRole("region", { name: "CDN purge" });
    // The edge may still be serving what that run covered — say so, dated.
    expect(section.textContent).toContain("incomplete");
    expect(within(section).getByText("7")).toBeTruthy();
  });
});

describe("StatusPanel status badge", () => {
  it("renders draining distinctly from healthy and degraded", async () => {
    mocks.getSystemStatus.mockResolvedValue(systemStatus(undefined, { status: "draining" }));
    render(<StatusPanel />);

    const badge = await screen.findByText("Draining");
    // Warning tone: a deploy in progress, not an outage and not health.
    expect(badge.className).toContain("text-warning");
    expect(screen.queryByText("Healthy")).toBeNull();
    expect(screen.queryByText("Degraded")).toBeNull();
    // The page agrees with what /readyz tells the load balancer.
    expect(screen.getByText(/shut(ting)? down|shutdown signal/i)).toBeTruthy();
  });
});

describe("StatusPanel component vocabulary", () => {
  it("names probe keys and statuses for operators, humanizing unknown keys", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus(undefined, {
        components: {
          s3: { status: "ok" },
          smtp: { status: "not_configured" },
          settings_sync: { status: "down", error: "poll failing" },
          future_probe: { status: "ok" },
        },
      }),
    );
    render(<StatusPanel />);

    expect(await screen.findByText("Object storage")).toBeTruthy();
    expect(screen.getByText("Outbound mail")).toBeTruthy();
    expect(screen.getByText("Settings sync")).toBeTruthy();
    // An unknown key is humanized, never dropped: this list is how an operator
    // discovers a probe the server shipped before this client learned its name.
    expect(screen.getByText("future probe")).toBeTruthy();
    expect(screen.queryByText("settings_sync")).toBeNull();

    // Status labels stop being wire enums.
    expect(screen.getAllByText("OK")).toHaveLength(2);
    expect(screen.getByText("Not configured")).toBeTruthy();
    expect(screen.getByText("Down")).toBeTruthy();
    expect(screen.queryByText("not_configured")).toBeNull();
  });
});
