// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIPFSStatus: vi.fn(),
  reconcileIPFS: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getIPFSStatus: mocks.getIPFSStatus,
      reconcileIPFS: mocks.reconcileIPFS,
    },
  };
});

import { ApiError } from "@/lib/api";

import { IPFSConfigPanel } from "./AdminIPFSConfigView";

const emptyPins = { pinned: 0, pending: 0, failed: 0, unpinned: 0 };
const status = {
  enabled: true,
  node_reachable: true,
  gateway_url: "https://ipfs.example.test",
  cluster_enabled: true,
  cluster_reachable: true,
  pins: { pinned: 14, pending: 2, failed: 1, unpinned: 3 },
  by_class: [],
  networks: {
    public: {
      enabled: true,
      node_reachable: true,
      cluster_enabled: true,
      cluster_reachable: true,
      pins: { pinned: 10, pending: 2, failed: 1, unpinned: 1 },
      by_class: [
        {
          media_class: "video_original",
          pinned: 8,
          pending: 1,
          failed: 1,
          unpinned: 0,
        },
      ],
    },
    private: {
      enabled: true,
      node_reachable: true,
      cluster_enabled: false,
      cluster_reachable: false,
      pins: { pinned: 4, pending: 0, failed: 0, unpinned: 2 },
      by_class: [
        {
          media_class: "user_avatar",
          pinned: 4,
          pending: 0,
          failed: 0,
          unpinned: 2,
        },
      ],
    },
  },
};

beforeEach(() => {
  mocks.getIPFSStatus.mockResolvedValue(status);
  mocks.reconcileIPFS.mockResolvedValue({ enqueued: 3, by_class: { user_avatar: 3 } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IPFSConfigPanel", () => {
  it("renders effective public/private configuration, health, and pin counts", async () => {
    render(<IPFSConfigPanel />);

    expect(await screen.findByRole("heading", { name: "Mirror overview" })).toBeTruthy();
    expect(screen.getByText("https://ipfs.example.test")).toBeTruthy();
    expect(screen.getByText("Public + Private")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Public distribution" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Private replication" })).toBeTruthy();
    expect(screen.getByText("Video original")).toBeTruthy();
    expect(screen.getByText("User avatar")).toBeTruthy();
    expect(screen.getAllByText("Healthy").length).toBe(2);
    expect(screen.getByText("Restart required")).toBeTruthy();
  });

  it("runs a network-scoped reconciliation and refreshes status", async () => {
    render(<IPFSConfigPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Reconcile private" }));

    await waitFor(() => expect(mocks.reconcileIPFS).toHaveBeenCalledWith("private"));
    expect(
      await screen.findByText(/Reconciliation accepted for private IPFS: queued 3 pin intents/),
    ).toBeTruthy();
    await waitFor(() => expect(mocks.getIPFSStatus).toHaveBeenCalledTimes(2));
  });

  it("shows a setup surface instead of an error when both tiers are disabled", async () => {
    mocks.getIPFSStatus.mockRejectedValue(
      new ApiError({ status: 503, code: "ipfs_disabled", message: "ipfs mirroring is not enabled" }),
    );
    render(<IPFSConfigPanel />);

    expect(await screen.findByText("Not configured")).toBeTruthy();
    expect(screen.getByText(/Neither the public distribution mirror nor the private/)).toBeTruthy();
    expect(screen.getByText(/IPFS_ENABLED · IPFS_API_URL/)).toBeTruthy();
    expect(screen.queryByText("Could not load IPFS configuration.")).toBeNull();
  });

  it("disables reconciliation for an unconfigured network", async () => {
    mocks.getIPFSStatus.mockResolvedValue({
      ...status,
      networks: {
        ...status.networks,
        private: { ...status.networks.private, enabled: false, pins: emptyPins, by_class: [] },
      },
    });
    render(<IPFSConfigPanel />);

    const button = await screen.findByRole("button", { name: "Reconcile private" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Off")).toBeTruthy();
  });
});
