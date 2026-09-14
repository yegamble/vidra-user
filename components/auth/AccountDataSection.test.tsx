// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { SoftwareBrandProvider } from "@/components/SoftwareBrandProvider";

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

// The import summary is the only account of what an import did, so its wording
// has to survive both reasons a follow can go uncreated. vidra-core counts an
// already-existing follow as skipped (it is `:execrows` with ON CONFLICT DO
// NOTHING), so "skipped (channel not on this instance)" asserted a cause the
// summary cannot know.
describe("AccountDataSection import summary", () => {
  async function importWith(summary: Record<string, unknown>) {
    mocks.importAccountArchive.mockResolvedValue(summary);
    const { container } = render(<AccountDataSection />);
    await waitFor(() => expect(screen.getByLabelText("Archive file (JSON)")).toBeDefined());
    const input = screen.getByLabelText("Archive file (JSON)") as HTMLInputElement;
    const file = new File([JSON.stringify({ vidra_export: { version: 1 }, profile: {} })],
      "archive.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Import archive" }));
    await waitFor(() => expect(screen.getByText("Import finished.")).toBeDefined());
    return container.textContent ?? "";
  }

  const base = {
    profile_applied: true,
    playlists_created: 0,
    playlist_items_added: 0,
    playlist_items_skipped: 0,
    follows_created: 0,
    follows_skipped: 0,
    notification_prefs_applied: 0,
    notification_prefs_skipped: 0,
    skipped_sections: {},
  };

  it("does not blame a skipped follow on a missing channel", async () => {
    const text = await importWith({ ...base, follows_created: 0, follows_skipped: 1 });
    expect(text).toContain("1 skipped");
    expect(text).not.toContain("channel not on this instance");
  });

  it("still reports created follows", async () => {
    const text = await importWith({ ...base, follows_created: 2, follows_skipped: 0 });
    expect(text).toContain("2 created");
  });
});

// White-label (branding.hide_software_name): the downloaded FILENAME and the
// import error copy are user-visible; the `vidra_export` envelope key inside the
// archive is the interchange format's own identifier and must NOT move.
describe("AccountDataSection while white-labelled", () => {
  async function clickDownload(hidden: boolean) {
    mocks.getAccountExport.mockResolvedValue({
      state: "done",
      download_ready: true,
      requested_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    mocks.downloadAccountExport.mockResolvedValue({ vidra_export: 1, profile: {} });
    // Capture the anchor the download helper clicks WITHOUT stubbing
    // document.createElement — testing-library's own render() calls it too.
    const names: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();

    render(
      <SoftwareBrandProvider hidden={hidden}>
        <AccountDataSection />
      </SoftwareBrandProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Download archive" }));
    await waitFor(() => expect(names.length).toBe(1));
    click.mockRestore();
    return names[0];
  }

  it("names the download after the software by default", async () => {
    expect(await clickDownload(false)).toBe("vidra-account-export.json");
  });

  it("names the download neutrally when hidden", async () => {
    expect(await clickDownload(true)).toBe("account-export.json");
  });

  async function rejectFile(hidden: boolean) {
    render(
      <SoftwareBrandProvider hidden={hidden}>
        <AccountDataSection />
      </SoftwareBrandProvider>,
    );
    const input = (await screen.findByLabelText("Archive file (JSON)")) as HTMLInputElement;
    // Structurally valid JSON that is NOT an archive: rejected without a round trip.
    const file = new File([JSON.stringify({ nope: true })], "x.json", {
      type: "application/json",
    });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole("button", { name: "Import archive" }));
    return screen.findByText(/not a/i);
  }

  it("names the software in the rejection by default", async () => {
    expect((await rejectFile(false)).textContent).toBe("That file is not a vidra account archive.");
  });

  it("stays neutral in the rejection when hidden", async () => {
    const alert = await rejectFile(true);
    expect(alert.textContent).toBe("That file is not a valid account archive.");
    expect(document.body.textContent).not.toMatch(/vidra/i);
  });
});
