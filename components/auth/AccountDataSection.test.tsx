// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`http ${status}`);
      this.status = status;
    }
  }
  return {
    FakeApiError,
    getAccountExport: vi.fn(),
    requestAccountExport: vi.fn(),
    downloadAccountExport: vi.fn(),
    importAccountArchive: vi.fn(),
    getInstanceCached: vi.fn(),
  };
});

vi.mock("@/lib/api", () => ({
  ApiError: mocks.FakeApiError,
  authApi: {
    getAccountExport: mocks.getAccountExport,
    requestAccountExport: mocks.requestAccountExport,
    downloadAccountExport: mocks.downloadAccountExport,
    importAccountArchive: mocks.importAccountArchive,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
  getInstanceCached: mocks.getInstanceCached,
}));

import { AccountDataSection } from "@/components/auth/AccountDataSection";

function instanceWith(features: Record<string, boolean>) {
  return { name: "Vidra", features };
}

beforeEach(() => {
  // No export was ever requested: the export card settles on "Request export".
  mocks.getAccountExport.mockRejectedValue(new mocks.FakeApiError(404));
  mocks.getInstanceCached.mockResolvedValue(
    instanceWith({ user_import: true, user_export: true }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Feature flags (config-parity W8/W15): /instance features.user_export /
// features.user_import hide the matching card; only an EXPLICIT false hides.
describe("AccountDataSection feature flags", () => {
  it("shows both cards when both flags are on", async () => {
    render(<AccountDataSection />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Request export" })).toBeDefined(),
    );
    expect(screen.getByText("Export your data")).toBeDefined();
    expect(screen.getByText("Import an archive")).toBeDefined();
  });

  it("hides the export card when user_export is off, keeping import", async () => {
    mocks.getInstanceCached.mockResolvedValue(
      instanceWith({ user_import: true, user_export: false }),
    );
    render(<AccountDataSection />);
    await waitFor(() => expect(screen.queryByText("Export your data")).toBeNull());
    expect(screen.getByText("Import an archive")).toBeDefined();
    expect(screen.getByText("Your data")).toBeDefined();
  });

  it("hides the import card when user_import is off, keeping export", async () => {
    mocks.getInstanceCached.mockResolvedValue(
      instanceWith({ user_import: false, user_export: true }),
    );
    render(<AccountDataSection />);
    await waitFor(() => expect(screen.queryByText("Import an archive")).toBeNull());
    expect(screen.getByText("Export your data")).toBeDefined();
  });

  it("hides the whole section when both flags are off", async () => {
    mocks.getInstanceCached.mockResolvedValue(
      instanceWith({ user_import: false, user_export: false }),
    );
    render(<AccountDataSection />);
    await waitFor(() => expect(screen.queryByText("Your data")).toBeNull());
    expect(screen.queryByText("Export your data")).toBeNull();
    expect(screen.queryByText("Import an archive")).toBeNull();
  });

  it("keeps both cards when the flags are absent (older backend)", async () => {
    mocks.getInstanceCached.mockResolvedValue(instanceWith({ uploads: true }));
    render(<AccountDataSection />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Request export" })).toBeDefined(),
    );
    expect(screen.getByText("Export your data")).toBeDefined();
    expect(screen.getByText("Import an archive")).toBeDefined();
  });

  it("keeps both cards when the instance read fails", async () => {
    mocks.getInstanceCached.mockRejectedValue(new Error("network down"));
    render(<AccountDataSection />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Request export" })).toBeDefined(),
    );
    expect(screen.getByText("Export your data")).toBeDefined();
    expect(screen.getByText("Import an archive")).toBeDefined();
  });
});
