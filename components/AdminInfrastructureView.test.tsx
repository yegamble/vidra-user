// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInfrastructure: vi.fn(),
  getSystemStatus: vi.fn(),
  getStorageMigrations: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getInfrastructure: mocks.getInfrastructure,
      getSystemStatus: mocks.getSystemStatus,
      getStorageMigrations: mocks.getStorageMigrations,
    },
  };
});

import { InfrastructurePanel } from "./AdminInfrastructureView";

const s3Storage = {
  backend: "s3" as const,
  local_root: "",
  s3_endpoint: "s3.example.test:443",
  s3_bucket: "vidra-media",
  s3_region: "us-east-1",
  s3_use_ssl: true,
  s3_force_path_style: false,
};

const localStorageBackend = {
  backend: "local" as const,
  local_root: "/var/lib/vidra/media",
  s3_endpoint: "",
  s3_bucket: "",
  s3_region: "",
  s3_use_ssl: false,
  s3_force_path_style: false,
};

function infrastructure(storage: typeof s3Storage | typeof localStorageBackend) {
  return {
    server: {
      environment: "production" as const,
      request_timeout_seconds: 30,
      stream_request_timeout_seconds: 900,
      body_limit: "8M",
      upload_max_bytes: 0,
      metrics_enabled: true,
      tracing_enabled: false,
      tracing_protocol: "grpc",
    },
    storage,
    networking: {
      public_base_url: "https://videos.example.test",
      https_effective: true,
      allow_plain_http: false,
      trusted_proxy_cidrs: [],
      cors_allowed_origins: [],
      federation_enabled: true,
      atproto_enabled: false,
      atproto_login_enabled: false,
    },
    backups: {
      external_postgres: false,
      schedule_note: "A database dump is written every day at 03:00 UTC.",
      staleness_note: "An artifact older than 26 hours means the schedule stopped.",
      artifacts_note: "Two families are kept.",
      live_state_note: "Run `vidra doctor` on the host.",
    },
    features: [
      {
        key: "object_storage",
        enabled: false,
        configured: false,
        note: "Media is stored on the api container's filesystem. Connect object storage (STORAGE_BACKEND=s3 plus endpoint, bucket and keys).",
      },
    ],
  };
}

function systemStatus(s3: { status: string; error?: string } | null) {
  return {
    status: "ok" as const,
    software: {
      name: "vidra",
      version: "0.2.1",
      commit: "abc1234",
      build_date: "2026-08-21",
      go_version: "go1.25",
    },
    environment: "production" as const,
    uptime_seconds: 900,
    components: {
      postgres: { status: "ok" },
      ...(s3 === null ? {} : { s3 }),
    },
    rate_limits: { enabled: true, requests: 300, auth_requests: 30, window_seconds: 60 },
  };
}

const copying = {
  id: "11111111-1111-1111-1111-111111111111",
  state: "copying" as const,
  source_desc: "local:/var/lib/vidra/media",
  target_desc: "s3://nyc3.example.test/vidra-media",
  objects_total: 400,
  objects_done: 120,
  objects_failed: 2,
  last_error: "",
  created_at: "2026-08-21T09:00:00Z",
  updated_at: "2026-08-21T09:30:00Z",
};

/**
 * The Storage panel's landmark, which now carries the live rows too. Async
 * because the deploy-shape fetch has to land before any panel exists.
 */
async function storagePanel() {
  return within(await screen.findByRole("region", { name: "Storage" }));
}

beforeEach(() => {
  mocks.getInfrastructure.mockResolvedValue(infrastructure(s3Storage));
  mocks.getSystemStatus.mockResolvedValue(systemStatus({ status: "ok" }));
  mocks.getStorageMigrations.mockResolvedValue({ migrations: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InfrastructurePanel storage surfacing", () => {
  it("reports an in-flight migration campaign with its phase and progress", async () => {
    mocks.getStorageMigrations.mockResolvedValue({ migrations: [copying] });
    render(<InfrastructurePanel />);

    const panel = await storagePanel();
    expect(await screen.findByText("Storage migration")).toBeTruthy();
    expect(panel.getByText("Copying")).toBeTruthy();
    // Store identity strings, verbatim: they are how a half-done cutover is spotted.
    expect(
      panel.getByText(/local:\/var\/lib\/vidra\/media → s3:\/\/nyc3\.example\.test\/vidra-media/),
    ).toBeTruthy();

    expect(panel.getByText("120 of 400 objects verified")).toBeTruthy();
    expect(panel.getByText("30%")).toBeTruthy();
    const bar = panel.getByRole("progressbar", { name: "Storage migration progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("30");

    // Dead-lettered objects are reported, not hidden behind the happy percentage.
    expect(panel.getByText(/2 objects dead-lettered/)).toBeTruthy();

    // Read-only surfacing: the campaign is driven from the host, so the only
    // control offered is a link to where the per-object queue is visible.
    expect(panel.queryByRole("button", { name: /cancel/i })).toBeNull();
    expect(
      panel.getByRole("link", { name: "Follow the per-object queue in Jobs" }).getAttribute("href"),
    ).toBe("/admin/jobs");
  });

  it("collapses a finished campaign to one line and drops the progress bar", async () => {
    mocks.getStorageMigrations.mockResolvedValue({
      migrations: [{ ...copying, state: "done" as const, objects_done: 400, objects_failed: 0 }],
    });
    render(<InfrastructurePanel />);

    expect(await screen.findByText(/Last migration: done on/)).toBeTruthy();
    expect(screen.queryByRole("progressbar", { name: "Storage migration progress" })).toBeNull();
  });

  it("offers the discovery card on a local deployment that has never migrated", async () => {
    mocks.getInfrastructure.mockResolvedValue(infrastructure(localStorageBackend));
    mocks.getSystemStatus.mockResolvedValue(systemStatus({ status: "not_configured" }));
    render(<InfrastructurePanel />);

    const heading = await screen.findByRole("heading", {
      name: /Media is on this server’s disk/,
    });
    expect(heading).toBeTruthy();
    const panel = await storagePanel();
    // The card's whole job is to say the move is reversible/verified, not to sell.
    expect(panel.getByText(/proves each copy by reading it back and re-hashing it/)).toBeTruthy();
    // A local backend has no remote store, so the probe says so instead of "down".
    expect(panel.getByText("Not applicable")).toBeTruthy();
    expect(panel.getByText(/no remote store to reach/)).toBeTruthy();

    // The feature row now deep-links at the panel that reports the live store.
    const features = within(screen.getByRole("region", { name: "Optional features" }));
    expect(
      features.getByRole("link", { name: "See the media store above" }).getAttribute("href"),
    ).toBe("/admin/infrastructure");
  });

  it("does not offer the discovery card once a campaign exists", async () => {
    mocks.getInfrastructure.mockResolvedValue(infrastructure(localStorageBackend));
    mocks.getStorageMigrations.mockResolvedValue({ migrations: [copying] });
    render(<InfrastructurePanel />);

    expect(await screen.findByText("Storage migration")).toBeTruthy();
    expect(screen.queryByText(/Media is on this server’s disk/)).toBeNull();
  });

  it("reports an unreachable object store as a failure, with the server's reason", async () => {
    mocks.getSystemStatus.mockResolvedValue(
      systemStatus({ status: "down", error: "the configured bucket does not exist" }),
    );
    render(<InfrastructurePanel />);

    const panel = await storagePanel();
    await waitFor(() => expect(panel.getByText("No")).toBeTruthy());
    expect(panel.getByRole("alert").textContent).toContain(
      "the configured bucket does not exist",
    );
  });

  it("re-checking refetches both live answers", async () => {
    render(<InfrastructurePanel />);
    const button = await screen.findByRole("button", { name: "Re-check" });

    await waitFor(() => expect(mocks.getSystemStatus).toHaveBeenCalledTimes(1));
    button.click();
    await waitFor(() => expect(mocks.getSystemStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.getStorageMigrations).toHaveBeenCalledTimes(2));
  });

  it("says the probe is unknown rather than healthy when the check itself fails", async () => {
    mocks.getSystemStatus.mockRejectedValue(new Error("network"));
    mocks.getStorageMigrations.mockRejectedValue(new Error("network"));
    render(<InfrastructurePanel />);

    const panel = await storagePanel();
    await waitFor(() => expect(panel.getByText("Not reported")).toBeTruthy());
    expect(panel.getByText(/unknown rather than healthy/)).toBeTruthy();
    // And a migration list that could not be read never implies "none running".
    expect(panel.getByText(/could not be read/)).toBeTruthy();
  });
});
