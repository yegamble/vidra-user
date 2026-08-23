// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlaybackHealth: vi.fn(),
  getInstanceSettings: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getPlaybackHealth: mocks.getPlaybackHealth,
      getInstanceSettings: mocks.getInstanceSettings,
    },
  };
});

import { PlaybackHealthPanel } from "./AdminPlaybackHealthView";

const WINDOW = {
  window_start: "2026-08-22T14:00:00Z",
  window_end: "2026-08-23T14:00:00Z",
};

/** A busy CDN source: hls.js AND native HLS contributed, nothing attested. */
const cdnSource = {
  delivery_source: "cdn" as const,
  event_count: 412,
  start_count: 128,
  rebuffer_count: 6,
  bitrate_switch_count: 340,
  error_count: 2,
  verified_session_count: 0,
  ttff: { p50_ms: 1237, p95_ms: 3456, p99_ms: 8123 },
  rebuffer: { p50_ms: 640, p95_ms: 2100, p99_ms: 4400 },
  rebuffer_total_ms: 18_400,
  error_counts: { network: 2 },
  engines: ["hls-js", "native-hls"] as const,
  partial_percentiles: false,
};

/** A quiet origin source: nobody stalled, so every rebuffer percentile is null. */
const originSource = {
  delivery_source: "api-proxy" as const,
  event_count: 40,
  start_count: 40,
  rebuffer_count: 0,
  bitrate_switch_count: 12,
  error_count: 0,
  verified_session_count: 0,
  ttff: { p50_ms: 420, p95_ms: 910, p99_ms: 990 },
  rebuffer: { p50_ms: null, p95_ms: null, p99_ms: null },
  rebuffer_total_ms: 0,
  error_counts: {},
  engines: ["hls-js"] as const,
  partial_percentiles: false,
};

const hlsJsBucket = {
  hour_bucket: "2026-08-23T13:00:00Z",
  delivery_source: "cdn" as const,
  engine: "hls-js" as const,
  packaging_format: "cmaf" as const,
  event_count: 300,
  start_count: 90,
  rebuffer_count: 6,
  bitrate_switch_count: 340,
  error_count: 2,
  verified_session_count: 0,
  ttff: { p50_ms: 1237, p95_ms: 3456, p99_ms: 8123 },
  rebuffer: { p50_ms: 640, p95_ms: 2100, p99_ms: 4400 },
  rebuffer_total_ms: 18_400,
  error_counts: { network: 2 },
  rendition_reporting_supported: true,
  computed_at: "2026-08-23T13:10:00Z",
};

/**
 * The Safari row. Zero bitrate switches is NOT a quality result here — the
 * browser owns variant selection through the manifest's SCORE attribute and
 * exposes no hook, so the engine structurally cannot report one.
 */
const nativeHlsBucket = {
  ...hlsJsBucket,
  engine: "native-hls" as const,
  packaging_format: "hls-ts" as const,
  bitrate_switch_count: 0,
  rendition_reporting_supported: false,
};

function health(overrides: Record<string, unknown> = {}) {
  return {
    ...WINDOW,
    sources: [],
    buckets: [],
    buckets_total: 0,
    limit: 24,
    offset: 0,
    ...overrides,
  };
}

function settings(enabled: boolean) {
  return {
    settings: [
      {
        key: "qoe_collection_enabled",
        type: "bool",
        value: enabled,
        default: true,
        overridden: !enabled,
        page: "advanced",
        section: "delivery",
      },
    ],
  };
}

beforeEach(() => {
  mocks.getPlaybackHealth.mockResolvedValue(health());
  mocks.getInstanceSettings.mockResolvedValue(settings(true));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlaybackHealthPanel — the exit criterion", () => {
  it("answers 'percentiles per source for the last 24h' with a parameterless call", async () => {
    mocks.getPlaybackHealth.mockResolvedValue(
      health({ sources: [cdnSource, originSource] }),
    );
    render(<PlaybackHealthPanel />);

    expect(await screen.findByText("CDN")).toBeTruthy();
    // The default window IS the criterion's window, and the endpoint already
    // means "last 24h" by "no since", so the default view sends none.
    const [params] = mocks.getPlaybackHealth.mock.calls[0];
    expect(params.since).toBeUndefined();

    // Percentiles at the resolution a 15%-bucket histogram has: two significant
    // figures, not the four the raw integers would print.
    expect(screen.getByText("p50 1.2 s · p95 3.5 s · p99 8.1 s")).toBeTruthy();
    expect(screen.getByText("p50 420 ms · p95 910 ms · p99 990 ms")).toBeTruthy();
  });

  it("says a source recorded no stall instead of printing a flawless 0 ms", async () => {
    mocks.getPlaybackHealth.mockResolvedValue(health({ sources: [originSource] }));
    render(<PlaybackHealthPanel />);

    expect(
      await screen.findByText(/No stall was recorded — which is not the same as 0 ms/),
    ).toBeTruthy();
    expect(screen.queryByText(/p50 0 ms/)).toBeNull();
  });

  it("states the attested share plainly rather than passing it off as proven", async () => {
    mocks.getPlaybackHealth.mockResolvedValue(
      health({ sources: [cdnSource, originSource] }),
    );
    render(<PlaybackHealthPanel />);

    expect(await screen.findByText("0% attested")).toBeTruthy();
    expect(
      screen.getByText(/reported by viewers’ players rather than proven by this server/),
    ).toBeTruthy();
  });
});

describe("PlaybackHealthPanel — native HLS cannot report renditions", () => {
  it("renders the Safari row's switch count as unreportable, never as zero", async () => {
    mocks.getPlaybackHealth.mockResolvedValue(
      health({
        sources: [cdnSource],
        buckets: [hlsJsBucket, nativeHlsBucket],
        buckets_total: 2,
      }),
    );
    render(<PlaybackHealthPanel />);

    const table = within(
      await screen.findByRole("table", { name: "Hourly playback quality" }),
    );
    const nativeRow = table
      .getAllByRole("row")
      .find((row) => row.textContent?.includes("Native HLS"));
    expect(nativeRow).toBeTruthy();

    const cell = within(nativeRow!).getByText("Not reportable");
    expect(cell.getAttribute("title")).toContain("SCORE attribute");
    // The zero it would otherwise have printed must not be in this row at all.
    expect(within(nativeRow!).queryByText("0")).toBeNull();

    // The engine that CAN report one still prints its number.
    const hlsRow = table
      .getAllByRole("row")
      .find((row) => row.textContent?.includes("hls.js"));
    expect(within(hlsRow!).getByText("340")).toBeTruthy();
  });

  it("warns that a merged source row under-counts switches when Safari contributed", async () => {
    mocks.getPlaybackHealth.mockResolvedValue(
      health({ sources: [cdnSource, originSource] }),
    );
    render(<PlaybackHealthPanel />);

    await screen.findByText("CDN");
    // Exactly one card carries the caveat: the one native HLS contributed to.
    const notes = screen.getAllByText(/structurally cannot report which variant/);
    expect(notes).toHaveLength(1);
  });
});

describe("PlaybackHealthPanel — empty is the normal initial state", () => {
  it("explains why an instance with collection ON has nothing yet", async () => {
    render(<PlaybackHealthPanel />);

    expect(await screen.findByText("Nothing measured in this window")).toBeTruthy();
    expect(screen.getByText(/rolled up every ten minutes/)).toBeTruthy();
    // Collection is on, so it must not be blamed.
    expect(screen.queryByText("Collection is switched off")).toBeNull();
    expect(await screen.findByText("On")).toBeTruthy();
  });

  it("names the switch, and where to flip it, when collection is OFF", async () => {
    mocks.getInstanceSettings.mockResolvedValue(settings(false));
    render(<PlaybackHealthPanel />);

    expect(await screen.findByText("Collection is switched off")).toBeTruthy();
    expect(screen.getByText("qoe_collection_enabled")).toBeTruthy();
    expect(await screen.findByText("Off")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Advanced config page" }).getAttribute("href"),
    ).toBe("/admin/config/advanced");
    expect(
      screen.getByRole("link", { name: "Turn it back on under Delivery" }).getAttribute("href"),
    ).toBe("/admin/config/advanced");
  });

  it("keeps 'off' a claim the server made, not a guess, when the switch is unreadable", async () => {
    mocks.getInstanceSettings.mockRejectedValue(new Error("boom"));
    mocks.getPlaybackHealth.mockResolvedValue(health({ sources: [cdnSource] }));
    render(<PlaybackHealthPanel />);

    // The isolated sub-panel fails on its own: the window of measurements the
    // operator came for is still on screen.
    expect(await screen.findByText("CDN")).toBeTruthy();
    expect(await screen.findByText("Not reported")).toBeTruthy();
    expect(screen.getByText(/unknown rather than off/)).toBeTruthy();
    expect(screen.queryByText("Off")).toBeNull();
  });

  it("says it cannot rule out an off switch when both the switch and the data are absent", async () => {
    mocks.getInstanceSettings.mockRejectedValue(new Error("boom"));
    render(<PlaybackHealthPanel />);

    expect(await screen.findByText("Nothing measured in this window")).toBeTruthy();
    expect(screen.getByText(/cannot rule out that measurement is simply off/)).toBeTruthy();
  });

  it("re-checks only the switch, leaving the rollups alone", async () => {
    render(<PlaybackHealthPanel />);
    const button = await screen.findByRole("button", { name: "Re-check" });
    await waitFor(() => expect(mocks.getInstanceSettings).toHaveBeenCalledTimes(1));

    button.click();
    await waitFor(() => expect(mocks.getInstanceSettings).toHaveBeenCalledTimes(2));
    expect(mocks.getPlaybackHealth).toHaveBeenCalledTimes(1);
  });
});

describe("PlaybackHealthPanel — failure handling", () => {
  it("shows the server's own reason when telemetry is not wired at all", async () => {
    const { ApiError } = await import("@/lib/api");
    mocks.getPlaybackHealth.mockRejectedValue(
      new ApiError({ status: 503, code: "unavailable", message: "playback telemetry is not available" }),
    );
    render(<PlaybackHealthPanel />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Playback telemetry is not wired on this server.");
  });
});
