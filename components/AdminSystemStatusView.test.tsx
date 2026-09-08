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

  // The scanner probe (core: clamav) is the one dependency whose failure is
  // invisible everywhere else — under the default fail-closed policy a dead
  // clamd makes every upload and URL import land in "failed" while the api
  // keeps answering 200. It must read as a named dependency with its reason,
  // not as a bare wire key.
  it("names the malware scanner, the storage-write probe and the MFA key", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus(undefined, {
        status: "degraded",
        components: {
          clamav: {
            status: "down",
            error:
              "the malware scanner is unreachable and MALWARE_SCAN_MODE=fail-closed, so every upload and every URL import is failing: clamav: dial: connection refused",
          },
          storage: { status: "ok" },
          mfa_kek: { status: "not_configured" },
        },
      }),
    );
    render(<StatusPanel />);

    expect(await screen.findByText("Malware scanning (ClamAV)")).toBeTruthy();
    expect(screen.getByText("Storage writes")).toBeTruthy();
    expect(screen.getByText("MFA secret key")).toBeTruthy();
    expect(screen.queryByText("clamav")).toBeNull();
    expect(screen.getByText(/every upload and every URL import is failing/)).toBeTruthy();
  });
});

// A17/ADM-04's first blocking gap: every block on this page described the
// process that SERVED the request, so on a split topology (VIDRA_ROLE=api plus
// VIDRA_ROLE=worker) a killed worker left the page reading "Healthy" with
// every dependency green. Measured live on the shipped build: the worker was
// killed and the page still answered ok 71 seconds later.
describe("StatusPanel processes", () => {
  const proc = (over: Record<string, unknown> = {}) => ({
    process_id: "vidra-api-1:1",
    role: "api",
    hostname: "vidra-api-1",
    pid: 1,
    version: "0.6.3",
    commit: "abc1234",
    state: "running",
    started_at: "2026-09-07T02:00:00Z",
    last_seen_at: "2026-09-07T03:00:00Z",
    last_seen_seconds_ago: 2,
    settings_poll: "ok",
    self: true,
    ...over,
  });

  it("omits the section entirely when heartbeats are not wired", async () => {
    render(<StatusPanel />);
    expect(await screen.findByLabelText("Rate limits")).toBeTruthy();
    // ABSENT, never an empty list: "no processes are running" is never true of
    // a page that just answered.
    expect(screen.queryByLabelText("Processes")).toBeNull();
  });

  it("lists the worker, not only the process that served the request", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus(undefined, {
        process_stale_seconds: 30,
        processes: [
          proc(),
          proc({
            process_id: "vidra-worker-1:1",
            role: "worker",
            hostname: "vidra-worker-1",
            self: false,
            last_seen_seconds_ago: 3,
          }),
        ],
      }),
    );
    render(<StatusPanel />);
    const section = await screen.findByLabelText("Processes");
    expect(within(section).getByText("Worker")).toBeTruthy();
    expect(within(section).getByText("vidra-worker-1:1")).toBeTruthy();
    // The reader must be able to tell which row is answering them.
    expect(within(section).getByText("this process")).toBeTruthy();
    // And the page explains its own staleness threshold rather than asking the
    // reader to guess it.
    expect(within(section).getByText(/more than 30s/)).toBeTruthy();
  });

  it("marks a process that stopped checking in as stale", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus(undefined, {
        status: "degraded",
        process_stale_seconds: 30,
        components: {
          settings_sync: {
            status: "down",
            error:
              "the worker process vidra-worker-1:1 has not checked in for 47s, so it is stopped, wedged or unable to reach the database",
          },
        },
        processes: [
          proc(),
          proc({
            process_id: "vidra-worker-1:1",
            role: "worker",
            self: false,
            state: "stale",
            last_seen_seconds_ago: 47,
          }),
        ],
      }),
    );
    render(<StatusPanel />);
    const section = await screen.findByLabelText("Processes");
    expect(within(section).getByText("Stale")).toBeTruthy();
    expect(within(section).getByText(/47s ago/)).toBeTruthy();
    // The dependency list must say WHY, in text. It used to live only in a
    // title attribute, so the reason a dependency was down was invisible
    // without a mouse.
    expect(
      screen.getByText(/has not checked in for 47s/),
    ).toBeTruthy();
  });

  it("shows a cleanly stopped replica without alarm", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus(undefined, {
        process_stale_seconds: 30,
        processes: [
          proc(),
          proc({
            process_id: "vidra-worker-1:1",
            role: "worker",
            self: false,
            state: "stopped",
            last_seen_seconds_ago: 600,
          }),
        ],
      }),
    );
    render(<StatusPanel />);
    const section = await screen.findByLabelText("Processes");
    // A scale-down is not an outage, and the replica stays visible.
    expect(within(section).getByText("Stopped")).toBeTruthy();
    expect(await screen.findByText("Healthy")).toBeTruthy();
  });

  it("names the failing poll on the process that reported it", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus(undefined, {
        status: "degraded",
        process_stale_seconds: 30,
        processes: [
          proc(),
          proc({
            process_id: "vidra-worker-1:1",
            role: "worker",
            self: false,
            settings_poll: "failing",
            settings_poll_error: "permission denied for table settings_version",
          }),
        ],
      }),
    );
    render(<StatusPanel />);
    const section = await screen.findByLabelText("Processes");
    expect(
      within(section).getByText(/permission denied for table settings_version/),
    ).toBeTruthy();
  });

  it("renders a role or state the client has not learned rather than dropping it", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus(undefined, {
        processes: [proc({ role: "scheduler", state: "quiescing", self: false })],
      }),
    );
    render(<StatusPanel />);
    const section = await screen.findByLabelText("Processes");
    // Same contract the dependency list and the feature list keep: the server
    // may ship a role before this client learns its name, and hiding it would
    // hide a process.
    expect(within(section).getByText("scheduler")).toBeTruthy();
    expect(within(section).getByText("quiescing")).toBeTruthy();
  });
});
