"use client";

import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type {
  PeerTubeImportConflictPolicy,
  PeerTubeImportMode,
  PeerTubeImportRun,
} from "@/lib/api";
import { formatCount, relativeTime } from "@/lib/format";

// Poll cadence for a launched (dry-run or real) import while it is still
// pending/running — one scheduled read per tick, unmount-safe.
const POLL_MS = 2000;

const CONFLICT_POLICIES: { value: PeerTubeImportConflictPolicy; label: string }[] = [
  { value: "skip", label: "Skip — leave existing Vidra rows untouched (safest)" },
  { value: "rename", label: "Rename — import the colliding row under a fresh handle/slug" },
  { value: "merge", label: "Merge — fold the source row into the existing Vidra row" },
  { value: "fail", label: "Fail — stop the whole import on the first collision" },
];

function isInFlight(run: PeerTubeImportRun | null): run is PeerTubeImportRun {
  return run !== null && (run.state === "pending" || run.state === "running");
}

// The per-entity column order for the report table.
const COUNT_COLUMNS = ["planned", "imported", "skipped", "failed", "unsupported"] as const;

// AdminPeerTubeImportView is the admin-only "Import from PeerTube" operations
// page. It launches a DRY-RUN (writes nothing) or a real import against the
// server-configured source, renders the mapping/conflict/count report, streams
// progress by polling the run, and exposes a conflict-policy selector. It NEVER
// asks for or accepts source database credentials in the browser — the source
// connection comes from the server configuration; this page only triggers and
// monitors. When the backend reports no source is configured (503), it shows
// operator guidance pointing at the server config instead of any credential form.
export function AdminPeerTubeImportView() {
  return (
    <RoleGate minRole="admin" action="import from PeerTube">
      <ImportPanel />
    </RoleGate>
  );
}

type Status = "loading" | "error" | "ready";

function ImportPanel() {
  const [status, setStatus] = useState<Status>("loading");
  const [runs, setRuns] = useState<PeerTubeImportRun[]>([]);
  // The run we currently show a report/progress for and (while in-flight) poll.
  const [activeRun, setActiveRun] = useState<PeerTubeImportRun | null>(null);
  const [conflictPolicy, setConflictPolicy] = useState<PeerTubeImportConflictPolicy>("skip");
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  // The backend reported no source is configured (503) — show guidance, never a form.
  const [notConfigured, setNotConfigured] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Bumped to re-schedule a poll tick after a transient poll failure.
  const [pollNonce, setPollNonce] = useState(0);

  // Initial load: read the run history and adopt either the in-flight run (so a
  // reload resumes monitoring an import someone else started) or the newest run
  // (to show the last report). The list endpoint works even when import is not
  // configured, so the page always loads honestly.
  useEffect(() => {
    const controller = new AbortController();
    api
      .listPeerTubeImports(controller.signal)
      .then((res) => {
        const list = res.runs ?? [];
        setRuns(list);
        setActiveRun(list.find(isInFlight) ?? list[0] ?? null);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Poll the active run while it is still pending/running. A success replaces
  // the run object (re-running this effect for the next tick); a transient
  // failure bumps pollNonce to retry. Unmount clears the timer and aborts.
  useEffect(() => {
    if (!isInFlight(activeRun)) return;
    const id = activeRun.id;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .getPeerTubeImport(id, controller.signal)
        .then((run) => {
          if (controller.signal.aborted) return;
          setActiveRun(run);
          setRuns((prev) => prev.map((r) => (r.id === run.id ? run : r)));
        })
        .catch((err: unknown) => {
          void err;
          if (controller.signal.aborted) return;
          setPollNonce((n) => n + 1);
        });
    }, POLL_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeRun, pollNonce]);

  const launch = useCallback(
    async (mode: PeerTubeImportMode) => {
      if (launching || isInFlight(activeRun)) return;
      setLaunching(true);
      setLaunchError(null);
      setNotConfigured(false);
      try {
        const run = await api.launchPeerTubeImport({ mode, conflict_policy: conflictPolicy });
        setActiveRun(run);
        setRuns((prev) => [run, ...prev]);
      } catch (err) {
        if (err instanceof ApiError && err.status === 503) {
          // Import is not configured on this instance — guidance, not a form.
          setNotConfigured(true);
        } else if (err instanceof ApiError && err.status === 409) {
          // Only one run may be active — adopt the in-progress one and monitor it.
          try {
            const res = await api.listPeerTubeImports();
            const list = res.runs ?? [];
            setRuns(list);
            const active = list.find(isInFlight) ?? null;
            if (active) setActiveRun(active);
            else setLaunchError("An import is already in progress.");
          } catch {
            setLaunchError("An import is already in progress.");
          }
        } else {
          setLaunchError(errorMessage(err, "Could not launch the import."));
        }
      } finally {
        setLaunching(false);
      }
    },
    [launching, activeRun, conflictPolicy],
  );

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading import status" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Could not load the import status."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  const inFlight = isInFlight(activeRun);
  const controlsDisabled = launching || inFlight;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 rounded-2xl bg-surface-muted p-4">
        <p className="text-sm font-semibold text-fg">The source connection comes from the server.</p>
        <p className="text-sm text-fg-muted">
          Vidra never asks for or accepts your PeerTube database or storage credentials in the
          browser. The read-only source connection is set in this server&rsquo;s configuration; this
          page only launches and monitors the one-way migration.
        </p>
      </div>

      {notConfigured ? (
        <NotConfiguredGuidance />
      ) : (
        <section aria-label="Launch an import" className="flex flex-col gap-4">
          <Select
            label="Conflict policy"
            hint="How collisions with existing Vidra accounts, handles, emails, or channel slugs are resolved."
            value={conflictPolicy}
            disabled={controlsDisabled}
            onChange={(e) => setConflictPolicy(e.target.value as PeerTubeImportConflictPolicy)}
          >
            {CONFLICT_POLICIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => void launch("dry_run")} disabled={controlsDisabled}>
              {launching ? "Starting…" : "Preview (dry run)"}
            </Button>
            <Button onClick={() => void launch("run")} disabled={controlsDisabled}>
              Start import
            </Button>
            {inFlight ? (
              <span className="text-sm text-fg-muted">An import run is in progress…</span>
            ) : null}
          </div>
          <p className="text-xs text-fg-muted">
            A dry run reports the mapping plan, counts, and conflicts and writes nothing — run one
            first. Start import performs the migration; it is idempotent and resumable, so re-running
            safely skips already-imported rows.
          </p>
          {launchError ? (
            <p role="alert" className="text-sm text-danger">
              {launchError}
            </p>
          ) : null}
        </section>
      )}

      {activeRun ? <RunPanel run={activeRun} /> : null}

      <HistorySection runs={runs} activeId={activeRun?.id} onSelect={setActiveRun} />
    </div>
  );
}

function NotConfiguredGuidance() {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Not configured</Badge>
        <h2 className="text-[15px] font-bold tracking-tight text-fg">
          PeerTube import is not set up on this instance
        </h2>
      </div>
      <p className="text-sm text-fg-muted">
        No PeerTube source is configured. To enable a migration, set the read-only source database
        connection and source media storage in this server&rsquo;s configuration (see the PeerTube
        migration guide), then reload this page.
      </p>
      <p className="text-sm text-fg-muted">
        For safety, source credentials are never entered here — they live only in the server
        configuration and are used server-side.
      </p>
    </Card>
  );
}

function RunPanel({ run }: { run: PeerTubeImportRun }) {
  const inFlight = run.state === "pending" || run.state === "running";
  const isDryRun = run.mode === "dry_run";
  const modeLabel = isDryRun ? "Dry run" : "Import";

  return (
    <section aria-label="Import run" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-bold tracking-tight text-fg">
          {modeLabel} {isDryRun ? "preview" : "run"}
        </h2>
        <RunStateBadge state={run.state} />
        {typeof run.source_version === "number" ? (
          <Badge variant="neutral">PeerTube schema v{run.source_version}</Badge>
        ) : null}
        <span className="text-xs text-fg-muted">started {relativeTime(run.created_at)}</span>
      </div>

      {inFlight ? (
        <div className="flex items-center gap-3" role="status">
          <Spinner label={isDryRun ? "Analyzing the source" : "Importing"} />
          <span className="text-sm text-fg-muted">
            {isDryRun
              ? "Analyzing the source and building the mapping plan…"
              : "Importing content from the source…"}
          </span>
        </div>
      ) : null}

      {run.state === "failed" ? (
        <p role="alert" className="text-sm text-danger">
          {run.error && run.error.length > 0
            ? run.error
            : "The import run failed. Check the server logs for details."}
        </p>
      ) : null}

      {run.report ? (
        <ReportView report={run.report} isDryRun={isDryRun} />
      ) : !inFlight && run.state !== "failed" ? (
        <p className="text-sm text-fg-muted">No report is available for this run.</p>
      ) : null}
    </section>
  );
}

function RunStateBadge({ state }: { state: PeerTubeImportRun["state"] }) {
  if (state === "done") return <Badge variant="success">Done</Badge>;
  if (state === "failed") return <Badge variant="danger">Failed</Badge>;
  if (state === "running") return <Badge variant="accent">Running</Badge>;
  return <Badge variant="neutral">Pending</Badge>;
}

function ReportView({
  report,
  isDryRun,
}: {
  report: NonNullable<PeerTubeImportRun["report"]>;
  isDryRun: boolean;
}) {
  const entities = Object.entries(report.entities ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">
        {isDryRun
          ? "This plan was computed without writing anything. Review the mapping and conflicts, then start the import."
          : "The migration summary below reflects what was written."}
      </p>

      {entities.length === 0 ? (
        <EmptyState title="Nothing to import" message="The source has no mappable entities." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Per-entity import counts</caption>
            <thead className="border-b border-border-subtle text-[10.5px] font-bold uppercase tracking-[0.05em] text-fg-muted">
              <tr>
                <th scope="col" className="px-3 py-2.5">
                  Entity
                </th>
                {COUNT_COLUMNS.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2.5 text-right">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {entities.map(([kind, counts]) => (
                <tr key={kind}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-fg">
                    {kind}
                  </th>
                  {COUNT_COLUMNS.map((c) => {
                    const value = counts[c] ?? 0;
                    const danger = c === "failed" && value > 0;
                    return (
                      <td
                        key={c}
                        className={`px-3 py-2 text-right tabular-nums ${
                          danger ? "font-semibold text-danger" : "text-fg-muted"
                        }`}
                      >
                        {formatCount(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.conflicts && report.conflicts.length > 0 ? (
        <section aria-label="Conflicts" className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-fg">
            Conflicts ({report.conflicts.length})
          </h3>
          <ul className="list-disc pl-5 text-sm text-fg-muted">
            {report.conflicts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.deferred && report.deferred.length > 0 ? (
        <section aria-label="Not migrated" className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-fg">Not migrated (regenerate by hand)</h3>
          <ul className="flex flex-wrap gap-2">
            {report.deferred.map((d) => (
              <li key={d}>
                <Badge variant="neutral">{d}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function HistorySection({
  runs,
  activeId,
  onSelect,
}: {
  runs: PeerTubeImportRun[];
  activeId?: string;
  onSelect: (run: PeerTubeImportRun) => void;
}) {
  if (runs.length === 0) {
    return (
      <section aria-label="Import history">
        <h2 className="mb-2 text-[15px] font-bold tracking-tight text-fg">Recent runs</h2>
        <EmptyState title="No import runs yet" message="Launch a dry run to preview a migration." />
      </section>
    );
  }

  return (
    <section aria-label="Import history">
      <h2 className="mb-2 text-[15px] font-bold tracking-tight text-fg">Recent runs</h2>
      <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle">
        {runs.map((run) => {
          const active = run.id === activeId;
          return (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => onSelect(run)}
                aria-current={active ? "true" : undefined}
                className={`focus-ring flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted ${
                  active ? "bg-surface-muted" : ""
                }`}
              >
                <span className="font-medium text-fg">
                  {run.mode === "dry_run" ? "Dry run" : "Import"}
                </span>
                <RunStateBadge state={run.state} />
                <span className="ml-auto text-xs text-fg-muted">{relativeTime(run.created_at)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
