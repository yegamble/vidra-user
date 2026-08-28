// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runMediaGC: vi.fn(),
  getMediaGCConfig: vi.fn(),
  adoptMediaGCBucket: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      runMediaGC: mocks.runMediaGC,
      getMediaGCConfig: mocks.getMediaGCConfig,
      adoptMediaGCBucket: mocks.adoptMediaGCBucket,
    },
  };
});

import { MediaGCPanel } from "./AdminMediaView";
import { ApiError } from "@/lib/api";
import type { MediaGCConfig, MediaGCResponse } from "@/lib/api";

const ORPHANS = ["web-videos/abc.mp4", "thumbnails/abc.jpg"];

function response(over: Partial<MediaGCResponse> = {}): MediaGCResponse {
  return {
    dry_run: true,
    mode: "dry-run",
    scanned: 120,
    orphans: ORPHANS,
    deleted: 0,
    orphan_percent: 1,
    breaker_tripped: false,
    bucket_ownership: "owned",
    forced_dry_run: false,
    ...over,
  };
}

function config(over: Partial<MediaGCConfig> = {}): MediaGCConfig {
  return { enabled: true, max_orphan_percent: 25, bucket_ownership: "owned", ...over };
}

function apiError(status: number): ApiError {
  return new ApiError({ status, code: "error", message: `upstream ${status}` });
}

// Drives the panel through the double confirmation into a real purge request
// (dry_run=false), which is the only path on which a downgrade can happen.
async function purge() {
  fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));
  await screen.findByText(/orphans to delete/);
  fireEvent.click(screen.getByRole("button", { name: /^Purge 2 orphans/ }));
  fireEvent.change(screen.getByLabelText("Type PURGE to confirm"), {
    target: { value: "PURGE" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm permanent purge" }));
}

beforeEach(() => {
  mocks.runMediaGC.mockReset();
  mocks.adoptMediaGCBucket.mockReset();
  // Default: the boot-facts GET fails, as it does on any backend that predates
  // it — every pre-existing test therefore exercises the graceful-absence path.
  mocks.getMediaGCConfig.mockReset().mockRejectedValue(apiError(404));
});
afterEach(cleanup);

describe("MediaGCPanel", () => {
  it("does NOT render the success state when the purge was downgraded to a dry run", async () => {
    mocks.runMediaGC.mockImplementation(async (dryRun: boolean) =>
      dryRun
        ? response()
        : response({
            dry_run: true,
            forced_dry_run: true,
            forced_dry_run_reason: "bucket_ownership",
            bucket_ownership: "unowned",
          }),
    );
    render(<MediaGCPanel />);
    await purge();

    await screen.findByText(/Purge downgraded to a dry run/);
    // The bug this test exists for: a neutered GC used to report itself green.
    expect(screen.queryByText("Purge complete")).toBeNull();
    expect(screen.queryByText(/Deleted 0 objects/)).toBeNull();
  });

  it("shows the forced reason verbatim plus the adopt-the-bucket hint", async () => {
    mocks.runMediaGC.mockImplementation(async (dryRun: boolean) =>
      dryRun
        ? response()
        : response({
            dry_run: true,
            forced_dry_run: true,
            forced_dry_run_reason: "bucket_ownership",
            bucket_ownership: "unowned",
          }),
    );
    render(<MediaGCPanel />);
    await purge();

    const downgraded = await screen.findByTestId("gc-forced-dry-run");
    expect(downgraded.textContent).toContain("bucket_ownership");
    expect(downgraded.textContent).toContain(".vidra/owner");
    expect(downgraded.textContent).toContain("Adopt the bucket");
    // A warning, not a failure: the sweep itself succeeded.
    expect(downgraded.getAttribute("role")).toBe("alert");
    expect(downgraded.className).toContain("text-warning");
  });

  it("explains the migration interlock in its own words", async () => {
    mocks.runMediaGC.mockImplementation(async (dryRun: boolean) =>
      dryRun
        ? response()
        : response({
            dry_run: true,
            forced_dry_run: true,
            forced_dry_run_reason: "storage_migration_active",
          }),
    );
    render(<MediaGCPanel />);
    await purge();

    const downgraded = await screen.findByTestId("gc-forced-dry-run");
    expect(downgraded.textContent).toContain("storage_migration_active");
    expect(downgraded.textContent).toContain("storage migration");
    expect(downgraded.textContent).not.toContain(".vidra/owner");
  });

  it("renders a tripped breaker as danger with the orphan share", async () => {
    mocks.runMediaGC.mockImplementation(async (dryRun: boolean) =>
      dryRun
        ? response({ orphan_percent: 61 })
        : response({
            dry_run: true,
            breaker_tripped: true,
            orphan_percent: 61,
          }),
    );
    render(<MediaGCPanel />);
    await purge();

    const tripped = await screen.findByTestId("gc-breaker-tripped");
    expect(tripped.textContent).toContain("61%");
    expect(tripped.textContent).toContain("nothing was deleted");
    expect(tripped.className).toContain("text-danger");
    expect(screen.queryByText("Purge complete")).toBeNull();
  });

  it("still reports a real purge as a success, with mode and ownership context", async () => {
    mocks.runMediaGC.mockImplementation(async (dryRun: boolean) =>
      dryRun
        ? response()
        : response({ dry_run: false, mode: "delete", deleted: 2 }),
    );
    render(<MediaGCPanel />);
    await purge();

    await screen.findByText("Purge complete");
    expect(screen.getByText(/Deleted 2 objects/)).toBeTruthy();
    expect(screen.queryByTestId("gc-forced-dry-run")).toBeNull();
    expect(screen.getByTestId("gc-result-context").textContent).toContain("Mode: delete");
    expect(screen.getByTestId("gc-result-context").textContent).toContain("Storage: owned");
  });

  it("warns before the purge is armed when the store's ownership forbids deleting", async () => {
    mocks.runMediaGC.mockResolvedValue(response({ bucket_ownership: "conflict" }));
    render(<MediaGCPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));

    const advisory = await screen.findByTestId("gc-ownership-advisory");
    expect(advisory.textContent).toContain("conflict");
    expect(advisory.textContent).toContain("another Vidra instance");
    // Only one call: the advisory is read off the dry run, never a second request.
    await waitFor(() => expect(mocks.runMediaGC).toHaveBeenCalledTimes(1));
  });

  it("says nothing about ownership when the store is this instance's", async () => {
    mocks.runMediaGC.mockResolvedValue(response());
    render(<MediaGCPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));

    await screen.findByText(/orphans to delete/);
    expect(screen.queryByTestId("gc-ownership-advisory")).toBeNull();
  });

  // The e2e mocks (and any older backend) answer without the safety fields; the
  // panel must not invent a warning out of an absent flag.
  it("degrades to the plain dry-run report when the safety fields are absent", async () => {
    mocks.runMediaGC.mockResolvedValue({
      dry_run: true,
      scanned: 120,
      orphans: ORPHANS,
      deleted: 0,
    } as unknown as MediaGCResponse);
    render(<MediaGCPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));

    await screen.findByText(/2 orphans to delete/);
    expect(screen.queryByTestId("gc-ownership-advisory")).toBeNull();
    expect(screen.queryByTestId("gc-forced-dry-run")).toBeNull();
  });

  // --- Honest intro copy -----------------------------------------------------
  // The old sentence ("nothing is deleted until you confirm a purge") was false
  // on a default install: MEDIA_GC_ENABLED runs a daily automatic destructive
  // sweep with no confirmation from anyone.
  it("scopes the confirmation promise to manual purges and names the automatic sweep", () => {
    render(<MediaGCPanel />);
    expect(screen.queryByText(/nothing is deleted until you confirm a purge/)).toBeNull();
    const intro = screen.getByText(/manual purge deletes nothing until you confirm/);
    expect(intro.textContent).toContain("daily automatic sweep");
    expect(intro.textContent).toContain("first sweep after each boot is always a dry run");
    expect(intro.textContent).toContain("manual or automatic");
  });

  // --- Boot facts (GET /admin/media/gc) --------------------------------------
  it("renders the boot facts read-only when the GET answers", async () => {
    mocks.getMediaGCConfig.mockResolvedValue(config());
    render(<MediaGCPanel />);

    const facts = await screen.findByTestId("gc-boot-facts");
    expect(facts.textContent).toContain("Automatic daily sweep");
    expect(facts.textContent).toContain("On");
    expect(facts.textContent).toContain("MEDIA_GC_ENABLED");
    expect(facts.textContent).toContain("25%");
    expect(facts.textContent).toContain("owned");
    // Read-only by design: the knob is boot-baked, so no toggle may appear.
    expect(within(facts).queryByRole("button")).toBeNull();
    expect(within(facts).queryByRole("switch")).toBeNull();
    expect(within(facts).queryByRole("checkbox")).toBeNull();
  });

  it("reports a disabled automatic sweep as Off, and local disk in operator words", async () => {
    mocks.getMediaGCConfig.mockResolvedValue(
      config({ enabled: false, bucket_ownership: "not-applicable" }),
    );
    render(<MediaGCPanel />);

    const facts = await screen.findByTestId("gc-boot-facts");
    expect(facts.textContent).toContain("Off");
    expect(facts.textContent).toContain("local disk");
    expect(facts.textContent).not.toContain("not-applicable");
  });

  it("renders the page exactly as today when the boot-facts GET fails (older backend)", async () => {
    mocks.getMediaGCConfig.mockRejectedValue(apiError(404));
    render(<MediaGCPanel />);

    await waitFor(() => expect(mocks.getMediaGCConfig).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("gc-boot-facts")).toBeNull();
    // Absence is not an error: the panel must not open with a failure banner.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Run dry run" })).toBeTruthy();
  });

  it("threads the known breaker limit into the tripped-breaker alert", async () => {
    mocks.getMediaGCConfig.mockResolvedValue(config({ max_orphan_percent: 40 }));
    mocks.runMediaGC.mockImplementation(async (dryRun: boolean) =>
      dryRun
        ? response({ orphan_percent: 61 })
        : response({ dry_run: true, breaker_tripped: true, orphan_percent: 61 }),
    );
    render(<MediaGCPanel />);
    await screen.findByTestId("gc-boot-facts");
    await purge();

    const tripped = await screen.findByTestId("gc-breaker-tripped");
    expect(tripped.textContent).toContain("61% found, limit 40%");
  });

  // --- Adopt-bucket action ---------------------------------------------------
  it("offers adoption from the ownership advisory when the store is unowned (arm, then confirm)", async () => {
    mocks.getMediaGCConfig.mockResolvedValue(config({ bucket_ownership: "unowned" }));
    mocks.runMediaGC.mockResolvedValue(response({ bucket_ownership: "unowned" }));
    mocks.adoptMediaGCBucket.mockResolvedValue({
      bucket_ownership: "owned",
      marker_key: ".vidra/owner",
    });
    render(<MediaGCPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));

    const advisory = await screen.findByTestId("gc-ownership-advisory");
    fireEvent.click(within(advisory).getByRole("button", { name: "Adopt this bucket" }));
    // Arming alone must not fire the request.
    expect(mocks.adoptMediaGCBucket).not.toHaveBeenCalled();
    fireEvent.click(within(advisory).getByRole("button", { name: "Confirm adoption" }));

    await waitFor(() => expect(mocks.adoptMediaGCBucket).toHaveBeenCalledTimes(1));
    // Success re-runs the dry run so the panel shows the post-adoption state…
    await waitFor(() => expect(mocks.runMediaGC).toHaveBeenCalledTimes(2));
    expect(mocks.runMediaGC).toHaveBeenLastCalledWith(true);
    // …and the boot-facts row reflects the ownership the response reported.
    const facts = screen.getByTestId("gc-boot-facts");
    await waitFor(() => expect(facts.textContent).toContain("owned"));
    expect(facts.textContent).not.toContain("unowned");
  });

  it("requires the typed ADOPT confirmation when the marker names another install", async () => {
    mocks.runMediaGC.mockResolvedValue(response({ bucket_ownership: "conflict" }));
    mocks.adoptMediaGCBucket.mockResolvedValue({
      bucket_ownership: "owned",
      marker_key: ".vidra/owner",
    });
    render(<MediaGCPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));

    const advisory = await screen.findByTestId("gc-ownership-advisory");
    fireEvent.click(within(advisory).getByRole("button", { name: "Adopt this bucket" }));
    // The loud path stays loud: the overwrite is named, and so is settling first.
    expect(advisory.textContent).toMatch(/overwrites/i);
    expect(advisory.textContent).toContain(".vidra/owner");
    expect(advisory.textContent).toMatch(/settle/i);

    const confirm = within(advisory).getByRole("button", {
      name: "Confirm adoption",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(mocks.adoptMediaGCBucket).not.toHaveBeenCalled();

    fireEvent.change(within(advisory).getByLabelText("Type ADOPT to confirm"), {
      target: { value: "ADOPT" },
    });
    fireEvent.click(within(advisory).getByRole("button", { name: "Confirm adoption" }));
    await waitFor(() => expect(mocks.adoptMediaGCBucket).toHaveBeenCalledTimes(1));
  });

  it("never offers adoption for unknown ownership — its remedy is configuration, not a marker", async () => {
    mocks.runMediaGC.mockResolvedValue(response({ bucket_ownership: "unknown" }));
    render(<MediaGCPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));

    const advisory = await screen.findByTestId("gc-ownership-advisory");
    expect(within(advisory).queryByRole("button", { name: "Adopt this bucket" })).toBeNull();
  });

  it("never offers adoption on a healthy install (owned or local disk)", async () => {
    for (const ownership of ["owned", "not-applicable"] as const) {
      cleanup();
      mocks.runMediaGC.mockResolvedValue(response({ bucket_ownership: ownership }));
      render(<MediaGCPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));

      await screen.findByText(/2 orphans to delete/);
      expect(screen.queryByRole("button", { name: "Adopt this bucket" })).toBeNull();
    }
  });

  it("offers adoption inside the bucket_ownership forced-dry-run alert too", async () => {
    mocks.runMediaGC.mockImplementation(async (dryRun: boolean) =>
      dryRun
        ? response({ bucket_ownership: "unowned" })
        : response({
            dry_run: true,
            forced_dry_run: true,
            forced_dry_run_reason: "bucket_ownership",
            bucket_ownership: "unowned",
          }),
    );
    render(<MediaGCPanel />);
    await purge();

    const downgraded = await screen.findByTestId("gc-forced-dry-run");
    expect(within(downgraded).getByRole("button", { name: "Adopt this bucket" })).toBeTruthy();
  });

  it("does not offer adoption for a migration-forced dry run, whatever the ownership", async () => {
    mocks.runMediaGC.mockImplementation(async (dryRun: boolean) =>
      dryRun
        ? response()
        : response({
            dry_run: true,
            forced_dry_run: true,
            forced_dry_run_reason: "storage_migration_active",
            bucket_ownership: "unowned",
          }),
    );
    render(<MediaGCPanel />);
    await purge();

    const downgraded = await screen.findByTestId("gc-forced-dry-run");
    expect(within(downgraded).queryByRole("button", { name: "Adopt this bucket" })).toBeNull();
  });

  it("maps the three adoption failure modes to honest messages", async () => {
    const cases: Array<[number, RegExp]> = [
      [409, /local disk/],
      [503, /migrations/],
      [502, /could not be written/],
    ];
    for (const [status, message] of cases) {
      cleanup();
      mocks.runMediaGC.mockReset().mockResolvedValue(response({ bucket_ownership: "unowned" }));
      mocks.adoptMediaGCBucket.mockReset().mockRejectedValue(apiError(status));
      render(<MediaGCPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));

      const advisory = await screen.findByTestId("gc-ownership-advisory");
      fireEvent.click(within(advisory).getByRole("button", { name: "Adopt this bucket" }));
      fireEvent.click(within(advisory).getByRole("button", { name: "Confirm adoption" }));

      await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
      // A failed adoption must not silently re-run the sweep as if it worked.
      expect(mocks.runMediaGC).toHaveBeenCalledTimes(1);
    }
  });

  // --- Orphan list cap -------------------------------------------------------
  it("caps the rendered orphan list at 500 and offers the full set as a download", async () => {
    const many = Array.from({ length: 501 }, (_, i) => `web-videos/${i}.mp4`);
    mocks.runMediaGC.mockResolvedValue(response({ orphans: many, scanned: 1000 }));
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:orphans");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    try {
      render(<MediaGCPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));
      await screen.findByText(/501 orphans to delete/);

      // 500 keys plus the "…and N more" row — never 501 key nodes.
      const items = screen.getAllByRole("listitem");
      expect(items.length).toBe(501);
      expect(screen.getByText(/and 1 more/)).toBeTruthy();
      expect(screen.queryByText("web-videos/500.mp4")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /Download full list/ }));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0]?.[0];
      expect(blob).toBeInstanceOf(Blob);
      const text = await (blob as Blob).text();
      // The download is the FULL set, including everything past the cap.
      expect(text).toContain("web-videos/500.mp4");
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:orphans");
    } finally {
      anchorClick.mockRestore();
    }
  });

  it("renders every key and no download affordance when the list is small", async () => {
    mocks.runMediaGC.mockResolvedValue(response());
    render(<MediaGCPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));

    await screen.findByText(/2 orphans to delete/);
    expect(screen.getAllByRole("listitem").length).toBe(2);
    expect(screen.queryByText(/and \d+ more/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Download full list/ })).toBeNull();
  });

  // --- Ownership badge wording -----------------------------------------------
  it("renders not-applicable as operator words, keeping the raw value in the title", async () => {
    mocks.runMediaGC.mockResolvedValue(response({ bucket_ownership: "not-applicable" }));
    render(<MediaGCPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));

    await screen.findByText(/2 orphans to delete/);
    const badge = screen.getByTitle("not-applicable");
    expect(badge.textContent).toBe("Storage: local disk");
    expect(screen.queryByText("Storage: not-applicable")).toBeNull();
  });
});
