// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listChannelSyncs: vi.fn(),
  createChannelSync: vi.fn(),
  triggerChannelSync: vi.fn(),
  deleteChannelSync: vi.fn(),
  getInstanceCached: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    listChannelSyncs: mocks.listChannelSyncs,
    createChannelSync: mocks.createChannelSync,
    triggerChannelSync: mocks.triggerChannelSync,
    deleteChannelSync: mocks.deleteChannelSync,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
  fieldErrors: () => undefined,
  getInstanceCached: mocks.getInstanceCached,
}));

import { ChannelSyncSection } from "@/components/ChannelSyncSection";
import type { Channel } from "@/lib/api";

const channels = [
  {
    id: "channel-1",
    handle: "films",
    display_name: "Films",
    created_at: "2026-01-01T00:00:00Z",
  } as Channel,
];

beforeEach(() => {
  mocks.listChannelSyncs.mockResolvedValue({ channel_syncs: [] });
  mocks.getInstanceCached.mockResolvedValue({
    name: "Vidra",
    features: { channel_sync: true },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Feature flag (config-parity W8/W15): /instance features.channel_sync drives
// the disabled empty state proactively; only an EXPLICIT false disables.
describe("ChannelSyncSection feature flag", () => {
  it("shows the connect form when channel_sync is on", async () => {
    render(<ChannelSyncSection channels={channels} />);
    await waitFor(() =>
      expect(screen.getByRole("form", { name: "Connect an external channel" })).toBeDefined(),
    );
    expect(screen.queryByText("Auto-import is disabled on this instance")).toBeNull();
  });

  it("shows the disabled empty state instead of the form when channel_sync is off", async () => {
    mocks.getInstanceCached.mockResolvedValue({
      name: "Vidra",
      features: { channel_sync: false },
    });
    render(<ChannelSyncSection channels={channels} />);
    await waitFor(() =>
      expect(screen.getByText("Auto-import is disabled on this instance")).toBeDefined(),
    );
    expect(screen.queryByRole("form", { name: "Connect an external channel" })).toBeNull();
  });

  it("keeps the connect form when the flag is absent (older backend)", async () => {
    mocks.getInstanceCached.mockResolvedValue({ name: "Vidra", features: {} });
    render(<ChannelSyncSection channels={channels} />);
    await waitFor(() =>
      expect(screen.getByRole("form", { name: "Connect an external channel" })).toBeDefined(),
    );
    expect(screen.queryByText("Auto-import is disabled on this instance")).toBeNull();
  });

  it("keeps the connect form when the instance read fails", async () => {
    mocks.getInstanceCached.mockRejectedValue(new Error("network down"));
    render(<ChannelSyncSection channels={channels} />);
    await waitFor(() =>
      expect(screen.getByRole("form", { name: "Connect an external channel" })).toBeDefined(),
    );
    expect(screen.queryByText("Auto-import is disabled on this instance")).toBeNull();
  });
});
