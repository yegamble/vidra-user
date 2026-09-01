// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launchPeerTubeImport: vi.fn(),
  listPeerTubeImports: vi.fn(),
  getPeerTubeImport: vi.fn(),
}));

// The panel is admin-gated; the gate's session plumbing is not what these tests
// are about, so it renders through.
vi.mock("@/components/RoleGate", () => ({
  RoleGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      launchPeerTubeImport: mocks.launchPeerTubeImport,
      listPeerTubeImports: mocks.listPeerTubeImports,
      getPeerTubeImport: mocks.getPeerTubeImport,
    },
  };
});

import { AdminPeerTubeImportView } from "./AdminPeerTubeImportView";
import { ApiError } from "@/lib/api";
import type { PeerTubeImportCounts, PeerTubeImportReport, PeerTubeImportRun } from "@/lib/api";

// Must match POLL_MS in the component — the cadence the in-flight poll runs at.
const POLL_MS = 2000;
const RUN_ID = "11111111-1111-1111-1111-111111111111";

function run(over: Partial<PeerTubeImportRun> = {}): PeerTubeImportRun {
  return {
    id: RUN_ID,
    mode: "run",
    state: "done",
    conflict_policy: "skip",
    created_at: "2026-08-31T10:00:00Z",
    updated_at: "2026-08-31T10:05:00Z",
    ...over,
  };
}

function counts(over: Partial<PeerTubeImportCounts> = {}): PeerTubeImportCounts {
  return { planned: 0, imported: 0, skipped: 0, failed: 0, unsupported: 0, ...over };
}

function report(entities: Record<string, PeerTubeImportCounts>): PeerTubeImportReport {
  return { dry_run: false, conflict_policy: "skip", entities };
}

function apiError(status: number): ApiError {
  return new ApiError({ status, code: "error", message: `upstream ${status}` });
}

// The one request body the panel POSTed. Read back as a bag of keys rather than
// compared whole, so a test can tell "absent" from "present and falsy" — the
// distinction the launch contract is built on.
function launchBody(): Record<string, unknown> {
  expect(mocks.launchPeerTubeImport).toHaveBeenCalledTimes(1);
  return mocks.launchPeerTubeImport.mock.calls[0][0] as Record<string, unknown>;
}

function startButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Start import" }) as HTMLButtonElement;
}

beforeEach(() => {
  mocks.launchPeerTubeImport.mockReset();
  mocks.listPeerTubeImports.mockReset();
  mocks.getPeerTubeImport.mockReset();
  // Default: no history, so the panel loads straight into enabled controls.
  mocks.listPeerTubeImports.mockResolvedValue({ runs: [] });
  mocks.launchPeerTubeImport.mockResolvedValue(run({ state: "pending" }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AdminPeerTubeImportView — launch payload", () => {
  it("POSTs the mode and the chosen conflict policy, with no schema sign-off", async () => {
    render(<AdminPeerTubeImportView />);
    await screen.findByRole("button", { name: "Start import" });

    fireEvent.change(screen.getByLabelText("Conflict policy"), { target: { value: "rename" } });
    fireEvent.click(startButton());

    await waitFor(() => expect(mocks.launchPeerTubeImport).toHaveBeenCalled());
    const body = launchBody();
    expect(body.mode).toBe("run");
    expect(body.conflict_policy).toBe("rename");
    // ABSENT, not null or false. Nothing was refused, so the version gate has to
    // stand: sending the key at all would be a sign-off nobody gave.
    expect(body).not.toHaveProperty("acknowledged_schema_version");
    expect(Object.keys(body)).not.toContain("acknowledged_schema_version");
  });

  it("launches the preview in dry_run mode", async () => {
    render(<AdminPeerTubeImportView />);
    await screen.findByRole("button", { name: "Preview (dry run)" });

    fireEvent.click(screen.getByRole("button", { name: "Preview (dry run)" }));

    await waitFor(() => expect(mocks.launchPeerTubeImport).toHaveBeenCalled());
    expect(launchBody().mode).toBe("dry_run");
  });

  it("never offers a field for source credentials", async () => {
    render(<AdminPeerTubeImportView />);
    await screen.findByRole("button", { name: "Start import" });

    // The source DSN comes from server config; the browser must never collect
    // one. No text input, no password input, anywhere on the panel.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector("input[type=password]")).toBeNull();
  });

  it("adopts the in-progress run when the server says one is already active", async () => {
    mocks.launchPeerTubeImport.mockRejectedValue(apiError(409));
    const active = run({ id: "aaaaaaaa-0000-0000-0000-000000000009", state: "running" });
    mocks.listPeerTubeImports
      .mockResolvedValueOnce({ runs: [] })
      .mockResolvedValueOnce({ runs: [active] });

    render(<AdminPeerTubeImportView />);
    await screen.findByRole("button", { name: "Start import" });
    fireEvent.click(startButton());

    // The 409 is not an error to show — it is a pointer at the run to monitor.
    await screen.findByRole("region", { name: "Import run" });
    expect(screen.getByText(/Importing content from the source/)).toBeTruthy();
  });
});

describe("AdminPeerTubeImportView — unverified schema sign-off", () => {
  const refused = () =>
    run({ state: "failed", error_code: "unverified_schema", source_version: 1055 });

  it("blocks launching until the refused version is acknowledged, then sends that version", async () => {
    mocks.listPeerTubeImports.mockResolvedValue({ runs: [refused()] });

    render(<AdminPeerTubeImportView />);
    const box = await screen.findByRole("checkbox", { name: /I accept PeerTube schema v1055/ });
    expect(startButton().disabled).toBe(true);

    fireEvent.click(box);
    expect(startButton().disabled).toBe(false);

    fireEvent.click(startButton());
    await waitFor(() => expect(mocks.launchPeerTubeImport).toHaveBeenCalled());
    // The version itself, not a boolean: the server opens the gate only on exact
    // equality with the version preflight detects.
    expect(launchBody().acknowledged_schema_version).toBe(1055);
  });

  it("spends the sign-off on the attempt it authorised, even when that attempt fails", async () => {
    mocks.listPeerTubeImports.mockResolvedValue({ runs: [refused()] });
    mocks.launchPeerTubeImport.mockRejectedValue(apiError(500));

    render(<AdminPeerTubeImportView />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /I accept PeerTube schema v1055/ }));
    fireEvent.click(startButton());

    // The tick does not survive the launch it authorised: the gate is back up
    // and the next run has to be signed off again, deliberately.
    await waitFor(() => {
      const box = screen.getByRole("checkbox", {
        name: /I accept PeerTube schema v1055/,
      }) as HTMLInputElement;
      expect(box.checked).toBe(false);
    });
    expect(startButton().disabled).toBe(true);
  });

  it("offers no sign-off at all when preflight could read no version", async () => {
    mocks.listPeerTubeImports.mockResolvedValue({
      runs: [run({ state: "failed", error_code: "undetectable_schema" })],
    });

    render(<AdminPeerTubeImportView />);
    await screen.findByText("No schema version could be read from the source");

    // Nothing to name, so there is deliberately nothing to tick — this refusal
    // is not overrulable from a browser.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/peertube-import --force/)).toBeTruthy();
  });
});

describe("AdminPeerTubeImportView — not configured", () => {
  it("replaces the launch controls with operator guidance on a 503", async () => {
    mocks.launchPeerTubeImport.mockRejectedValue(apiError(503));

    render(<AdminPeerTubeImportView />);
    await screen.findByRole("button", { name: "Start import" });
    fireEvent.click(startButton());

    await screen.findByText("PeerTube import is not set up on this instance");
    // Guidance, never a form: the launch section is gone and no credential
    // field takes its place.
    expect(screen.queryByRole("button", { name: "Start import" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Launch an import" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows a retryable error state when the history cannot be loaded", async () => {
    mocks.listPeerTubeImports.mockRejectedValueOnce(apiError(500));

    render(<AdminPeerTubeImportView />);
    await screen.findByText("Could not load the import status.");

    mocks.listPeerTubeImports.mockResolvedValue({ runs: [] });
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    await screen.findByRole("button", { name: "Start import" });
  });
});

describe("AdminPeerTubeImportView — in-flight polling", () => {
  it("renders progress, locks the launch controls, and polls the run until it settles", async () => {
    vi.useFakeTimers();
    mocks.listPeerTubeImports.mockResolvedValue({ runs: [run({ state: "running" })] });
    mocks.getPeerTubeImport.mockResolvedValue(
      run({ state: "done", report: report({ video: counts({ planned: 2, imported: 2 }) }) }),
    );

    render(<AdminPeerTubeImportView />);
    // Flush the mount fetch without leaving fake timers.
    await act(async () => {});

    const panel = screen.getByRole("region", { name: "Import run" });
    expect(within(panel).getByText(/Importing content from the source/)).toBeTruthy();
    expect(within(panel).getByLabelText("Importing")).toBeTruthy();
    // A run is in flight, so nothing may be launched over the top of it.
    expect(startButton().disabled).toBe(true);
    expect(screen.getByText("An import run is in progress…")).toBeTruthy();
    // The poll is scheduled, not immediate — the mount read is the first fact.
    expect(mocks.getPeerTubeImport).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });

    expect(mocks.getPeerTubeImport).toHaveBeenCalledWith(RUN_ID, expect.anything());
    const settled = screen.getByRole("region", { name: "Import run" });
    expect(within(settled).getByText("Done")).toBeTruthy();
    expect(startButton().disabled).toBe(false);

    // Settled: the poll stops rather than spinning forever.
    mocks.getPeerTubeImport.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(mocks.getPeerTubeImport).not.toHaveBeenCalled();
  });
});

describe("AdminPeerTubeImportView — report and history", () => {
  it("renders the per-entity counts of a finished run", async () => {
    mocks.listPeerTubeImports.mockResolvedValue({
      runs: [
        run({
          state: "done",
          source_version: 1040,
          report: report({ video: counts({ planned: 9, imported: 7, skipped: 2 }) }),
        }),
      ],
    });

    render(<AdminPeerTubeImportView />);
    const panel = await screen.findByRole("region", { name: "Import run" });

    expect(within(panel).getByText("PeerTube schema v1040")).toBeTruthy();
    const row = within(panel).getByRole("row", { name: /video/ });
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    // Column order: planned, imported, skipped, failed, unsupported.
    expect(cells).toEqual(["9", "7", "2", "0", "0"]);
  });

  it("lists the run history newest-first and switches the report on select", async () => {
    const older = run({
      id: "bbbbbbbb-0000-0000-0000-000000000002",
      mode: "dry_run",
      state: "failed",
    });
    mocks.listPeerTubeImports.mockResolvedValue({ runs: [run({ state: "done" }), older] });

    render(<AdminPeerTubeImportView />);
    const history = await screen.findByRole("region", { name: "Import history" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Import")).toBeTruthy();
    expect(within(rows[1]).getByText("Dry run")).toBeTruthy();

    fireEvent.click(within(rows[1]).getByRole("button"));
    const panel = screen.getByRole("region", { name: "Import run" });
    expect(within(panel).getByText("Dry run preview")).toBeTruthy();
  });

  it("shows the empty state when no import has ever run", async () => {
    render(<AdminPeerTubeImportView />);
    await screen.findByText("No import runs yet");
    expect(screen.queryByRole("region", { name: "Import run" })).toBeNull();
  });

  // CHARACTERIZATION — this pins TODAY'S behaviour, which is wrong.
  //
  // DEFECT (not fixed here, by design): the failure branch in RunPanel keys on
  // `run.state === "failed"`, which is the state of the RUN, not of its
  // contents. A run that completed while every single entity inside it failed
  // is `state: "done"`, so it renders the success branch: a green "Done" badge
  // over the line "reflects what was written", with no alert and no warning.
  // The only trace is the per-entity `failed` cell, which an operator has to
  // notice on their own. A later PR should branch on the report's failed totals
  // as well as the run state; this test is here so that change is visible as a
  // deliberate behaviour change rather than an accident.
  it("renders the completion branch for a done run whose every entity failed", async () => {
    mocks.listPeerTubeImports.mockResolvedValue({
      runs: [
        run({
          state: "done",
          report: report({
            video: counts({ planned: 4, failed: 4 }),
            user: counts({ planned: 2, failed: 2 }),
          }),
        }),
      ],
    });

    render(<AdminPeerTubeImportView />);
    const panel = await screen.findByRole("region", { name: "Import run" });

    expect(within(panel).getByText("Done")).toBeTruthy();
    expect(within(panel).getByText(/reflects what was written/)).toBeTruthy();
    // Nothing raises an alarm, even though nothing at all was imported.
    expect(within(panel).queryByRole("alert")).toBeNull();
    expect(within(panel).queryByText(/failed/i, { selector: "p" })).toBeNull();

    // The counts are on screen, and they are the whole of the signal.
    const videoCells = within(within(panel).getByRole("row", { name: /video/ }))
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(videoCells).toEqual(["4", "0", "0", "4", "0"]);
  });
});
