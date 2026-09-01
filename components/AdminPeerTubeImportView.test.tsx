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

  it("omits source_authoritative entirely when the cutover box is left alone", async () => {
    render(<AdminPeerTubeImportView />);
    await screen.findByRole("button", { name: "Start import" });

    fireEvent.click(startButton());

    await waitFor(() => expect(mocks.launchPeerTubeImport).toHaveBeenCalled());
    const body = launchBody();
    // Controls: the keys that MUST be present, so the absence assertion below
    // cannot pass because the body was empty or undefined.
    expect(body.mode).toBe("run");
    expect(body.conflict_policy).toBe("skip");
    // ABSENT, not false. The server default is already false; sending an
    // explicit false would be this page stating a decision nobody made.
    expect(body).not.toHaveProperty("source_authoritative");
    expect(Object.keys(body)).not.toContain("source_authoritative");
  });

  it("sends source_authoritative: true when the cutover box is ticked", async () => {
    render(<AdminPeerTubeImportView />);
    const box = await screen.findByRole("checkbox", { name: /the source win/i });
    expect((box as HTMLInputElement).checked).toBe(false);

    fireEvent.click(box);
    fireEvent.click(startButton());

    await waitFor(() => expect(mocks.launchPeerTubeImport).toHaveBeenCalled());
    const body = launchBody();
    expect(body.source_authoritative).toBe(true);
    // Controls: the cutover tick is its own axis — it does not disturb the
    // mode or the conflict policy, and it is not a schema sign-off.
    expect(body.mode).toBe("run");
    expect(body.conflict_policy).toBe("skip");
    expect(Object.keys(body)).not.toContain("acknowledged_schema_version");
  });

  it("omits media_mode entirely while the selector is left on the server default", async () => {
    render(<AdminPeerTubeImportView />);
    await screen.findByRole("button", { name: "Start import" });

    fireEvent.click(startButton());

    await waitFor(() => expect(mocks.launchPeerTubeImport).toHaveBeenCalled());
    const body = launchBody();
    // Controls: the keys that MUST be present, so the absence assertion below
    // cannot pass because the body was empty or undefined.
    expect(body.mode).toBe("run");
    expect(body.conflict_policy).toBe("skip");
    // ABSENT, not "copy" and not "". The instance has a configured default, and
    // naming a mode here would be this page making the most expensive decision
    // on the screen on the operator's behalf — the same rule the cutover tick
    // and the schema sign-off already follow.
    expect(body).not.toHaveProperty("media_mode");
    expect(Object.keys(body)).not.toContain("media_mode");
  });

  it("sends the media mode the operator chose", async () => {
    render(<AdminPeerTubeImportView />);
    await screen.findByRole("button", { name: "Start import" });

    fireEvent.change(screen.getByLabelText("Media"), { target: { value: "reference" } });
    fireEvent.click(startButton());

    await waitFor(() => expect(mocks.launchPeerTubeImport).toHaveBeenCalled());
    const body = launchBody();
    expect(body.media_mode).toBe("reference");
    // Controls: media mode is its own axis — it disturbs neither the run mode,
    // the conflict policy, nor the schema gate.
    expect(body.mode).toBe("run");
    expect(body.conflict_policy).toBe("skip");
    expect(Object.keys(body)).not.toContain("acknowledged_schema_version");
  });

  it("warns that reference mode is permanent, and only for reference mode", async () => {
    render(<AdminPeerTubeImportView />);
    const select = await screen.findByLabelText("Media");
    const launch = screen.getByRole("region", { name: "Launch an import" });

    // Copy is the answer for a real migration, so it gets no banner.
    fireEvent.change(select, { target: { value: "copy" } });
    expect(within(launch).queryByRole("alert")).toBeNull();

    // Reference copies nothing, so this instance plays out of the source's
    // bucket for good. Finding that out after the old instance is switched off
    // is the failure this banner exists to prevent.
    fireEvent.change(select, { target: { value: "reference" } });
    const alert = within(launch).getByRole("alert");
    expect(alert.textContent).toMatch(/never|permanent/i);

    // It clears again: a property of the choice, not a sticky warning.
    fireEvent.change(select, { target: { value: "none" } });
    expect(within(launch).queryByRole("alert")).toBeNull();
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

    // Nothing to name, so there is deliberately no SIGN-OFF to tick — this
    // refusal is not overrulable from a browser. (The unrelated cutover box
    // still stands, so this asks about the sign-off by name.)
    expect(screen.queryByRole("checkbox", { name: /I accept PeerTube schema/ })).toBeNull();
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
          report: report({ video: counts({ planned: 9, imported: 7, updated: 5, skipped: 2 }) }),
        }),
      ],
    });

    render(<AdminPeerTubeImportView />);
    const panel = await screen.findByRole("region", { name: "Import run" });

    expect(within(panel).getByText("PeerTube schema v1040")).toBeTruthy();
    // Control: nothing inside this run failed, so it keeps the success badge.
    expect(within(panel).getByText("Done")).toBeTruthy();
    // `updated` is a column of its own: it is the counter a source-authoritative
    // re-run increments, and without it such a run reads as having done nothing.
    expect(within(panel).getByRole("columnheader", { name: "updated" })).toBeTruthy();
    const row = within(panel).getByRole("row", { name: /video/ });
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    // Column order: planned, imported, updated, skipped, failed, unsupported.
    expect(cells).toEqual(["9", "7", "5", "2", "0", "0"]);
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

  it("marks the source-authoritative runs in the history, and only those", async () => {
    mocks.listPeerTubeImports.mockResolvedValue({
      runs: [
        run({ id: "cccccccc-0000-0000-0000-000000000003", source_authoritative: true }),
        run({ id: "dddddddd-0000-0000-0000-000000000004" }),
      ],
    });

    render(<AdminPeerTubeImportView />);
    const history = await screen.findByRole("region", { name: "Import history" });
    const rows = within(history).getAllByRole("listitem");

    // "Why did that title change?" is asked weeks later, against a list of
    // runs that all look alike — so the row itself has to carry the answer.
    expect(within(rows[0]).getByText("Cutover — source wins")).toBeTruthy();
    // Control: the gap-filling run beside it is unmarked, so the badge cannot
    // be something every row renders regardless of the flag.
    expect(within(rows[1]).queryByText("Cutover — source wins")).toBeNull();
  });

  it("shows the empty state when no import has ever run", async () => {
    render(<AdminPeerTubeImportView />);
    await screen.findByText("No import runs yet");
    expect(screen.queryByRole("region", { name: "Import run" })).toBeNull();
  });

  // Was a CHARACTERIZATION test pinning the defect below; this PR fixes it, so
  // it now asserts the corrected behaviour.
  //
  // The failure branch used to key on `run.state === "failed"`, which is the
  // state of the RUN, not of its contents. Core keeps `state = 'done'` for a
  // run that reached the end with per-entity failures — the run did finish — so
  // a run in which every entity failed rendered the success branch: a green
  // "Done" badge with no alert, the only signal being a red integer in one cell.
  it("warns, instead of congratulating, when a done run's entities all failed", async () => {
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

    // The run reached the end, but nothing in it did — so no success badge.
    expect(within(panel).queryByText("Done")).toBeNull();
    expect(within(panel).getByText("Finished with failures")).toBeTruthy();

    // The warning names the totals rather than leaving them to be spotted.
    const alert = within(panel).getByRole("alert");
    expect(alert.textContent).toContain("6");
    expect(alert.textContent).toContain("video 4");
    expect(alert.textContent).toContain("user 2");

    // Control: the warning replaces the success badge, not the report — the
    // per-entity table is still rendered underneath it.
    const videoCells = within(within(panel).getByRole("row", { name: /video/ }))
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(videoCells).toEqual(["4", "0", "0", "0", "4", "0"]);
  });

  it("names each run's media mode in the history, and never guesses one it was not told", async () => {
    mocks.listPeerTubeImports.mockResolvedValue({
      runs: [
        run({ id: "eeeeeeee-0000-0000-0000-000000000005", media_mode: "reference" }),
        run({ id: "ffffffff-0000-0000-0000-000000000006", media_mode: "copy" }),
        // Launched before core recorded the mode. It took the server default of
        // the day, which was stored nowhere — so "copy" here would be a
        // fabricated record rather than a good guess.
        run({ id: "aaaaaaaa-0000-0000-0000-000000000007", media_mode: "" }),
      ],
    });

    render(<AdminPeerTubeImportView />);
    const history = await screen.findByRole("region", { name: "Import history" });
    const rows = within(history).getAllByRole("listitem");

    // "Why is my object store this large?" and "why does nothing play?" get
    // asked long after the run has scrolled out of view, against a list of runs
    // that otherwise look identical — the same argument that put the cutover
    // mark on these rows.
    expect(within(rows[0]).getByText(/Referenced media/)).toBeTruthy();
    expect(within(rows[1]).getByText(/Media copied/)).toBeTruthy();
    expect(within(rows[2]).getByText(/not recorded/i)).toBeTruthy();
    // The pre-#141 run is not badged as a copy run.
    expect(within(rows[2]).queryByText(/Media copied/)).toBeNull();
  });

  it("carries the media mode in the run-panel header too", async () => {
    mocks.listPeerTubeImports.mockResolvedValue({
      runs: [run({ media_mode: "none", report: report({ video: counts({ imported: 3 }) }) })],
    });

    render(<AdminPeerTubeImportView />);
    const panel = await screen.findByRole("region", { name: "Import run" });
    expect(within(panel).getByText(/Metadata only/)).toBeTruthy();
  });

  it("surfaces videos that imported with nothing to play, instead of leaving them a table row", async () => {
    mocks.listPeerTubeImports.mockResolvedValue({
      runs: [
        run({
          state: "done",
          report: report({
            video: counts({ planned: 140, imported: 140 }),
            // Core tallies this absence under `imported`: the videos were
            // inserted, they just carry no file and no playlist.
            video_no_media: counts({ imported: 140 }),
          }),
        }),
      ],
    });

    render(<AdminPeerTubeImportView />);
    const panel = await screen.findByRole("region", { name: "Import run" });

    // By every other measure this run is a clean success — 140 videos imported,
    // nothing failed — and none of them will play. One more number in one more
    // table row is not how anybody finds that out.
    const alert = within(panel).getByRole("alert");
    expect(alert.textContent).toContain("140");
    expect(alert.textContent).toMatch(/nothing to play/i);

    // Control: the warning is additional to the table, which still carries the row.
    expect(within(panel).getByRole("rowheader", { name: "video_no_media" })).toBeTruthy();
  });

  it("says nothing about missing media when every video came across with some", async () => {
    mocks.listPeerTubeImports.mockResolvedValue({
      runs: [
        run({
          state: "done",
          report: report({
            video: counts({ planned: 140, imported: 140 }),
            video_no_media: counts({ imported: 0 }),
          }),
        }),
      ],
    });

    render(<AdminPeerTubeImportView />);
    const panel = await screen.findByRole("region", { name: "Import run" });
    // A zero belongs in the table, not in a banner. Warnings that fire on
    // nothing are the ones operators learn to scroll past.
    expect(within(panel).queryByRole("alert")).toBeNull();
  });
});
