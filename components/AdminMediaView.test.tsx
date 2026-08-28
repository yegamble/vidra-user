// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runMediaGC: vi.fn() }));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, runMediaGC: mocks.runMediaGC } };
});

import { MediaGCPanel } from "./AdminMediaView";
import type { MediaGCResponse } from "@/lib/api";

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
});
