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

type Feature = { key: string; enabled: boolean; configured: boolean; note?: string };

const objectStorageFeature: Feature = {
  key: "object_storage",
  enabled: false,
  configured: false,
  note: "Media is stored on the api container's filesystem. Connect object storage (STORAGE_BACKEND=s3 plus endpoint, bucket and keys).",
};

function infrastructure(
  storage: typeof s3Storage | typeof localStorageBackend,
  features: Feature[] = [objectStorageFeature],
) {
  return {
    server: {
      environment: "production" as const,
      role: "all" as const,
      request_timeout_seconds: 30,
      stream_request_timeout_seconds: 900,
      body_limit: "8M",
      upload_max_bytes: 0,
      metrics_enabled: true,
      tracing_enabled: false,
      tracing_protocol: "grpc",
      db_max_conns: 10,
      db_min_conns: 2,
      db_conn_max_lifetime_seconds: 3600,
      db_conn_max_idle_time_seconds: 300,
      drain_delay_seconds: 15,
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
    features,
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

describe("InfrastructurePanel pool sizing and drain", () => {
  it("reports the pool sizing the deployment chose, with the timeouts humanized", async () => {
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Database" }));
    expect(panel.getByText("10")).toBeTruthy();
    expect(panel.getByText("2")).toBeTruthy();
    // 3600 and 300 are how the environment spells them; an operator compares
    // "1h"/"5m" against what they set without dividing first.
    expect(panel.getByText("1h")).toBeTruthy();
    expect(panel.getByText("5m")).toBeTruthy();
  });

  it("reports the shutdown drain delay next to the other request limits", async () => {
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Server" }));
    // Sub-minute matters here: the app's formatUptime would render 15s as "0m".
    expect(panel.getByText("15s")).toBeTruthy();
  });

  it("does not dress a zero drain delay up as a duration", async () => {
    const base = infrastructure(s3Storage);
    mocks.getInfrastructure.mockResolvedValue({
      ...base,
      server: { ...base.server, drain_delay_seconds: 0 },
    });
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Server" }));
    expect(panel.getByText(/closes immediately/)).toBeTruthy();
  });
});

describe("InfrastructurePanel feature vocabulary", () => {
  const cdn: Feature = {
    key: "cdn",
    enabled: false,
    configured: true,
    note: "This deployment has a CDN base URL, so the edge is wired and the switch is off.",
  };
  const drm: Feature = {
    key: "drm",
    enabled: false,
    configured: false,
    note: "No DRM provider is selected. The only provider this build ships is clearkey-test.",
  };

  it("names the newest features instead of humanizing their raw keys", async () => {
    mocks.getInfrastructure.mockResolvedValue(infrastructure(s3Storage, [cdn, drm]));
    render(<InfrastructurePanel />);

    const features = within(await screen.findByRole("region", { name: "Optional features" }));
    expect(features.getByText("CDN delivery")).toBeTruthy();
    expect(features.getByText("DRM content protection")).toBeTruthy();
    // The fallback would render the wire keys verbatim.
    expect(features.queryByText("cdn")).toBeNull();
    expect(features.queryByText("drm")).toBeNull();
  });

  it("links CDN at the section that actually carries its switch, and DRM nowhere", async () => {
    mocks.getInfrastructure.mockResolvedValue(infrastructure(s3Storage, [cdn, drm]));
    render(<InfrastructurePanel />);

    const features = within(await screen.findByRole("region", { name: "Optional features" }));
    // "CDN delivery" is the label of the delivery_cdn_enabled toggle on that
    // page, and the anchor drops the operator at the Delivery section instead
    // of the top of a long form (AdminInstanceConfigView's sectionAnchorId).
    expect(features.getByRole("link", { name: "Open settings" }).getAttribute("href")).toBe(
      "/admin/config/advanced#config-section-delivery",
    );
    // DRM is boot-env only: a link would send the operator hunting for a switch
    // that is not on any admin page.
    expect(features.getAllByRole("link")).toHaveLength(1);
  });
});

describe("InfrastructurePanel process role", () => {
  it("explains an all-in-one process beside the environment", async () => {
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Server" }));
    expect(panel.getByText("Process role")).toBeTruthy();
    expect(panel.getByText(/also runs the background workers/)).toBeTruthy();
  });

  it("explains an api-only process — the workers live elsewhere", async () => {
    const base = infrastructure(s3Storage);
    mocks.getInfrastructure.mockResolvedValue({
      ...base,
      server: { ...base.server, role: "api" },
    });
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Server" }));
    expect(panel.getByText(/background workers run in separate worker processes/)).toBeTruthy();
  });

  it("renders an unmapped role verbatim rather than inventing a story", async () => {
    const base = infrastructure(s3Storage);
    mocks.getInfrastructure.mockResolvedValue({
      ...base,
      server: { ...base.server, role: "worker" },
    });
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Server" }));
    expect(panel.getByText("worker")).toBeTruthy();
  });

  it("omits the row on a backend that predates the field", async () => {
    const base = infrastructure(s3Storage);
    mocks.getInfrastructure.mockResolvedValue({
      ...base,
      server: { ...base.server, role: undefined },
    });
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Server" }));
    expect(panel.getByText("production")).toBeTruthy();
    expect(panel.queryByText("Process role")).toBeNull();
  });
});

describe("InfrastructurePanel delivery and live coordinates", () => {
  it("reports the CDN base URL when an edge is wired", async () => {
    mocks.getInfrastructure.mockResolvedValue({
      ...infrastructure(s3Storage),
      delivery: { cdn_base_url: "https://cdn.example.test" },
    });
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Networking" }));
    expect(panel.getByText("CDN base URL")).toBeTruthy();
    expect(panel.getByText("https://cdn.example.test")).toBeTruthy();
  });

  it("omits the CDN row entirely when no CDN is wired", async () => {
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Networking" }));
    expect(panel.getByText("Public address")).toBeTruthy();
    expect(panel.queryByText("CDN base URL")).toBeNull();
  });

  it("reports the live ingest coordinates when the live block is present", async () => {
    mocks.getInfrastructure.mockResolvedValue({
      ...infrastructure(s3Storage),
      live: { rtmp_url: "rtmp://ingest.example.test/live", hls_root: "/var/lib/vidra/live" },
    });
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Live ingest" }));
    expect(panel.getByText("rtmp://ingest.example.test/live")).toBeTruthy();
    expect(panel.getByText("/var/lib/vidra/live")).toBeTruthy();
  });

  it("renders enabled-but-unwired live coordinates as absent, not zero facts", async () => {
    // The contract sends the block with EMPTY strings when live is enabled
    // with nothing behind it — the empty coordinates ARE the finding.
    mocks.getInfrastructure.mockResolvedValue({
      ...infrastructure(s3Storage),
      live: { rtmp_url: "", hls_root: "" },
    });
    render(<InfrastructurePanel />);

    const panel = within(await screen.findByRole("region", { name: "Live ingest" }));
    expect(panel.getAllByText("—")).toHaveLength(2);
  });

  it("omits the live panel when the live feature is off", async () => {
    render(<InfrastructurePanel />);

    expect(await screen.findByRole("region", { name: "Server" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Live ingest" })).toBeNull();
  });
});

describe("InfrastructurePanel feature-row links and disclosure", () => {
  it("links a fully active cdn row at its runtime switch even without a note", async () => {
    // The failure this guards: the link only rendered inside the note
    // conditional, so the one row whose Enabled half IS a runtime toggle had
    // no path to its control exactly when it was on and healthy (no note).
    mocks.getInfrastructure.mockResolvedValue(
      infrastructure(s3Storage, [{ key: "cdn", enabled: true, configured: true }]),
    );
    render(<InfrastructurePanel />);

    const features = within(await screen.findByRole("region", { name: "Optional features" }));
    expect(features.getByRole("link", { name: "Open settings" }).getAttribute("href")).toBe(
      "/admin/config/advanced#config-section-delivery",
    );
  });

  it("collapses an Off note to its first sentence behind a More disclosure", async () => {
    render(<InfrastructurePanel />);

    const features = within(await screen.findByRole("region", { name: "Optional features" }));
    const summary = features
      .getByText(/Media is stored on the api container/)
      .closest("summary");
    expect(summary).not.toBeNull();
    // The lead sentence and the disclosure affordance are visible; the rest of
    // the paragraph waits behind it.
    expect(summary!.textContent).toContain("More");
    expect(summary!.textContent).not.toContain("Connect object storage");
    const details = summary!.closest("details");
    expect(details!.textContent).toContain("Connect object storage");
  });

  it("keeps a single-sentence Off note plain — nothing to disclose", async () => {
    mocks.getInfrastructure.mockResolvedValue(
      infrastructure(s3Storage, [
        {
          key: "tracing",
          enabled: false,
          configured: false,
          note: "Export request traces to an OpenTelemetry collector.",
        },
      ]),
    );
    render(<InfrastructurePanel />);

    const features = within(await screen.findByRole("region", { name: "Optional features" }));
    const note = features.getByText(/Optional: Export request traces/);
    expect(note.closest("details")).toBeNull();
    expect(features.queryByText("More")).toBeNull();
  });

  it("keeps an enabled-but-unconfigured finding fully expanded", async () => {
    // Warnings deserve the space; only discovery copy collapses.
    mocks.getInfrastructure.mockResolvedValue(
      infrastructure(s3Storage, [
        {
          key: "mail",
          enabled: true,
          configured: false,
          note: "Mail is enabled but no SMTP relay is configured. Password resets and notifications cannot be delivered until one is.",
        },
      ]),
    );
    render(<InfrastructurePanel />);

    const features = within(await screen.findByRole("region", { name: "Optional features" }));
    const note = features.getByText(/no SMTP relay is configured/);
    expect(note.textContent).toContain("cannot be delivered until one is");
    expect(note.closest("details")).toBeNull();
  });
});
