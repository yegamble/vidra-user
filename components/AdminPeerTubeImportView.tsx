"use client";

import { useCallback, useEffect, useState } from "react";

import { DownloadIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type {
  PeerTubeImportConflictPolicy,
  PeerTubeImportMediaMode,
  PeerTubeImportMode,
  PeerTubeImportRun,
} from "@/lib/api";
import { formatCount, pluralize, relativeTime } from "@/lib/format";

// Poll cadence for a launched (dry-run or real) import while it is still
// pending/running — one scheduled read per tick, unmount-safe.
const POLL_MS = 2000;

const CONFLICT_POLICIES: { value: PeerTubeImportConflictPolicy; label: string }[] = [
  { value: "skip", label: "Skip — leave existing Vidra rows untouched (safest)" },
  { value: "rename", label: "Rename — import the colliding row under a fresh handle/slug" },
  { value: "merge", label: "Merge — fold the source row into the existing Vidra row" },
  { value: "fail", label: "Fail — stop the whole import on the first collision" },
];

// The media-mode choice, as the operator's own state: "" is "say nothing and
// take the instance's configured default", which is why it is a select value
// here and never a value on the wire. Ordered by how far each departs from
// leaving the server alone.
type MediaModeChoice = "" | PeerTubeImportMediaMode;

// Labels state the CONSEQUENCE, not the field value. This is the most
// expensive decision on the page and the only one whose damage surfaces months
// later — a copy run costs disk, a reference run costs the ability to ever
// switch the old instance off, and neither is visible in the counts afterwards.
const MEDIA_MODES: { value: MediaModeChoice; label: string }[] = [
  { value: "", label: "Server default — whatever this instance is configured for" },
  { value: "copy", label: "Copy — bring every file into this instance's storage" },
  { value: "reference", label: "Reference — play from the source's storage, copy nothing" },
  { value: "none", label: "Metadata only — import no media at all" },
];

// The recorded mode of a run, for the badge it carries wherever it is listed.
// A run reports "" when it predates core recording this, and an absent field is
// the same admission from a server older still: both are "not recorded", and
// neither may be rendered as `copy`. Guessing the common case would put a
// fabricated fact in the migration history, which is worse than an honest gap
// precisely because nobody would go back and check it.
const RUN_MEDIA_MODE_LABELS: Record<PeerTubeImportMediaMode, string> = {
  copy: "Media copied",
  reference: "Referenced media — source storage",
  none: "Metadata only",
};

function isInFlight(run: PeerTubeImportRun | null): run is PeerTubeImportRun {
  return run !== null && (run.state === "pending" || run.state === "running");
}

// The two schema-version refusals preflight can return (error_code on a failed
// run). They are NOT interchangeable: `unverified_schema` names a version an
// admin may overrule from here; `undetectable_schema` names nothing at all and
// so cannot be acknowledged in a browser — it needs the CLI's --force.
const UNVERIFIED_SCHEMA = "unverified_schema";
const UNDETECTABLE_SCHEMA = "undetectable_schema";

// The schema version a run was REFUSED for and an admin may sign off on, or
// null. Both halves matter: the refusal class, and a version to name. A refusal
// with no readable version is never acknowledgeable.
function refusedSchemaVersion(run: PeerTubeImportRun | null): number | null {
  if (!run || run.state !== "failed" || run.error_code !== UNVERIFIED_SCHEMA) return null;
  return typeof run.source_version === "number" ? run.source_version : null;
}

// Preflight could not read a version from the source at all — there is nothing
// to name, so this page must not offer an acknowledgement for it.
function isUndetectableSchema(run: PeerTubeImportRun | null): boolean {
  return run?.state === "failed" && run.error_code === UNDETECTABLE_SCHEMA;
}

// The per-entity column order for the report table. `updated` sits next to
// `imported` because it is the other half of "what did this run write": core
// tallies rows it CHANGED to match the source separately from rows it created,
// and it is the only counter a source-authoritative cutover run moves. Leaving
// it out made such a run read as having done nothing but skip.
const COUNT_COLUMNS = [
  "planned",
  "imported",
  "updated",
  "skipped",
  "failed",
  "unsupported",
] as const;

// The families a report recorded failures for, worst first. Core keeps a run's
// state at `done` when the run itself reached the end, so per-entity failures
// live only here — `state` cannot tell a clean migration from one where every
// row failed.
function failedFamilies(
  report: PeerTubeImportRun["report"],
): { kind: string; failed: number }[] {
  return Object.entries(report?.entities ?? {})
    .map(([kind, counts]) => ({ kind, failed: counts.failed ?? 0 }))
    .filter((f) => f.failed > 0)
    .sort((a, b) => b.failed - a.failed || a.kind.localeCompare(b.kind));
}

// AdminPeerTubeImportView is the admin-only "Import from PeerTube" operations
// page. It launches a DRY-RUN (writes nothing) or a real import against the
// server-configured source, renders the mapping/conflict/count report, streams
// progress by polling the run, and exposes a conflict-policy selector. It NEVER
// asks for or accepts source database credentials in the browser — the source
// connection comes from the server configuration; this page only triggers and
// monitors. When the backend reports no source is configured (503), it shows
// operator guidance pointing at the server config instead of any credential form.
//
// It also carries the one refusal an administrator is entitled to overrule: a
// source whose schema version is outside the importer's verified range comes
// back as a failed run with error_code `unverified_schema` and the detected
// `source_version`, and this page turns that into a named, per-run sign-off
// (see UnverifiedSchemaNotice). Its sibling `undetectable_schema` is NOT
// offered a sign-off here — no version was read, so there is nothing to name.
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
  // The cutover decision: whether the source wins where the two sides have
  // diverged. Unlike the schema sign-off below it is deliberately NOT spent by
  // the launch it authorised — the operator previews the cutover and then runs
  // it, and silently unticking it in between would make that real run gap-fill
  // only, which is the exact failure this control exists to close.
  const [sourceAuthoritative, setSourceAuthoritative] = useState(false);
  // What this run does with the source's media objects. It was boot
  // configuration until core made it a launch field: changing it used to mean
  // editing the env file and restarting the api, in the middle of a migration.
  // "" is not a fourth mode — it is the operator declining to override, and it
  // sends no key at all.
  const [mediaMode, setMediaMode] = useState<MediaModeChoice>("");
  // The unverified schema VERSION the admin has signed off on — deliberately a
  // version and not a boolean, mirroring the server's own rule: the gate opens
  // only on exact equality with the version the source currently reports, so a
  // sign-off on 1040 stops meaning anything once the source moves to 1055.
  const [acknowledgedVersion, setAcknowledgedVersion] = useState<number | null>(null);
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

  // The version the run on screen was refused for (null when it was not refused
  // for a version), and whether a launch is currently blocked on the admin
  // naming it. Selecting a different run re-derives both — an acknowledgement
  // ticked for one version does not survive the view moving to another.
  const refusedVersion = refusedSchemaVersion(activeRun);
  const schemaUndetectable = isUndetectableSchema(activeRun);
  const awaitingAcknowledgement = refusedVersion !== null && acknowledgedVersion !== refusedVersion;

  const launch = useCallback(
    async (mode: PeerTubeImportMode) => {
      if (launching || isInFlight(activeRun)) return;
      // Blocked on an unacknowledged schema refusal — the buttons are disabled,
      // this is the second lock so no code path can launch around it.
      if (awaitingAcknowledgement) return;
      setLaunching(true);
      setLaunchError(null);
      setNotConfigured(false);
      try {
        const run = await api.launchPeerTubeImport({
          mode,
          conflict_policy: conflictPolicy,
          // Sent ONLY when ticked. The server default is already false, and an
          // explicit false would be this page stating a write policy the
          // operator never chose.
          ...(sourceAuthoritative ? { source_authoritative: true } : {}),
          // Sent ONLY when the operator picked a mode. Omitted, the instance's
          // configured default stands; naming one here by default would be this
          // page silently deciding whether the migration copies bytes.
          ...(mediaMode !== "" ? { media_mode: mediaMode } : {}),
          // Sent ONLY when the tick names the version the source currently
          // reports; omitted entirely in the normal case, leaving the gate up.
          ...(refusedVersion !== null && acknowledgedVersion === refusedVersion
            ? { acknowledged_schema_version: refusedVersion }
            : {}),
        });
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
        // The tick is spent by the attempt it authorised, however that attempt
        // ended. Nothing carries a sign-off into a later run behind the
        // admin's back — the next one has to be given again, deliberately.
        setAcknowledgedVersion(null);
      }
    },
    [
      launching,
      activeRun,
      conflictPolicy,
      sourceAuthoritative,
      mediaMode,
      awaitingAcknowledgement,
      refusedVersion,
      acknowledgedVersion,
    ],
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
  // Busy disables the whole panel; the acknowledgement gate disables only the
  // two launch buttons (the conflict policy stays editable while deciding).
  const controlsDisabled = launching || inFlight;
  const launchDisabled = controlsDisabled || awaitingAcknowledgement;

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

          <MediaModeField value={mediaMode} disabled={controlsDisabled} onChange={setMediaMode} />

          <CutoverToggle
            checked={sourceAuthoritative}
            disabled={controlsDisabled}
            onChange={setSourceAuthoritative}
          />

          {refusedVersion !== null ? (
            <UnverifiedSchemaNotice
              version={refusedVersion}
              acknowledged={acknowledgedVersion === refusedVersion}
              disabled={controlsDisabled}
              onAcknowledgedChange={(on) => setAcknowledgedVersion(on ? refusedVersion : null)}
            />
          ) : null}
          {schemaUndetectable ? <UndetectableSchemaNotice /> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => void launch("dry_run")} disabled={launchDisabled}>
              {launching ? "Starting…" : "Preview (dry run)"}
            </Button>
            <Button onClick={() => void launch("run")} disabled={launchDisabled}>
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

// The media-mode control. The three modes are not variations on one another and
// the copy has to say so: they differ in what the operator is left owning when
// the migration is over. Copy is the answer for an actual migration — it costs
// time and twice the disk while both instances run, and it ends with a source
// that can be switched off. Reference ends with one that cannot, ever, because
// nothing was moved; that is the fact this field exists to state up front,
// since every signal an operator gets afterwards (a fast run, full counts,
// videos that play) looks like success. Metadata only is a rehearsal.
function MediaModeField({
  value,
  disabled,
  onChange,
}: {
  value: MediaModeChoice;
  disabled: boolean;
  onChange: (mode: MediaModeChoice) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Select
        label="Media"
        hint="What this run does with the source's video files. It is set per run — you do not have to restart the server to change it between runs."
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as MediaModeChoice)}
      >
        {MEDIA_MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>
      <p className="text-xs text-fg-muted">
        Copy is the migration: every file is streamed into this instance&rsquo;s own storage, so it
        is slow and needs the space on both sides while you cut over — but when it finishes, the
        old instance can be switched off. Reference moves nothing; it records the source&rsquo;s
        object keys and plays from that same storage. Metadata only writes no media at all, for
        rehearsing the mapping.
      </p>
      {value === "reference" ? (
        <div role="alert" className="flex flex-col gap-1 rounded-2xl bg-warning/15 p-3">
          <p className="text-sm font-semibold text-warning">
            Reference mode does not migrate your media, and there is no later step that does.
          </p>
          <p className="text-sm text-fg-muted">
            This instance will depend on the source&rsquo;s object storage to play these videos for
            as long as they exist, so that storage can never be turned off and playback breaks the
            day it goes away. Choose copy if the point of this migration is to decommission the old
            instance.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// The cutover control. It is labelled for the decision an operator is making —
// "is this the switchover run?" — rather than for the field it sets, because
// the workflow this tool is used for is a series of catch-up runs against a
// still-live PeerTube followed by one final run at the switchover. Every run
// but that last one should gap-fill; the last one has to carry across the
// edits, deletions and privacy changes made on the source in between, which
// otherwise vanish behind counts that look exactly like healthy idempotency.
function CutoverToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Checkbox
        label="Final cutover run — let the source win where it and this instance have diverged"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <p className="text-xs text-fg-muted">
        Leave this off while you are running repeatedly against a live source: those runs only
        fill gaps, so anything edited, hidden or deleted on the source since the last run is
        skipped. Tick it for the switchover run so those changes follow. It updates only the rows
        this import created — never anything made on Vidra — and never re-downloads media.
      </p>
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

// The acknowledgement a refused-for-its-version source needs before this page
// will launch anything. It names the detected version in the heading, in the
// tick, and in the reminder underneath, because that number is the whole
// decision: the server opens the gate only for an exactly-equal version, so an
// admin who has not read it cannot express this and one who has cannot express
// it for a source that has since moved on.
function UnverifiedSchemaNotice({
  version,
  acknowledged,
  disabled,
  onAcknowledgedChange,
}: {
  version: number;
  acknowledged: boolean;
  disabled: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
}) {
  return (
    <Card className="flex flex-col gap-2 ring-1 ring-inset ring-warning/40">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">Unverified schema</Badge>
        <h2 className="text-[15px] font-bold tracking-tight text-fg">
          The source reports PeerTube schema v{version}, which this importer has not been verified
          against
        </h2>
      </div>
      <p className="text-sm text-fg-muted">
        The importer reads the source database directly, by column name. On a schema nobody has
        checked it against, those columns may have been renamed, retyped, or removed: the run can
        stop partway through, and it can carry wrong values across without failing at all. Nothing
        downstream re-checks what was written — you would have to.
      </p>
      <p className="text-sm text-fg-muted">
        If you accept it, preview first. A dry run still writes nothing, and it is the cheapest way
        to find out how much of schema v{version} this importer can actually read. Before a real
        import, have a database backup you are willing to restore from.
      </p>
      <Checkbox
        label={`I accept PeerTube schema v${version} for this run, and that the import may stop partway through or write wrong data.`}
        checked={acknowledged}
        disabled={disabled}
        onChange={(e) => onAcknowledgedChange(e.target.checked)}
      />
      <p className="text-xs text-fg-muted">
        This covers the next launch only. It is not remembered, and it stops applying if the
        source&rsquo;s schema version changes.
      </p>
    </Card>
  );
}

// The other refusal: preflight read NO version. There is no number to name, so
// there is deliberately no checkbox here — an acknowledgement in the abstract
// is exactly what the server refuses to accept.
function UndetectableSchemaNotice() {
  return (
    <Card className="flex flex-col gap-2 ring-1 ring-inset ring-warning/40">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">Schema version unreadable</Badge>
        <h2 className="text-[15px] font-bold tracking-tight text-fg">
          No schema version could be read from the source
        </h2>
      </div>
      <p className="text-sm text-fg-muted">
        Preflight found no migration version in the source database, so there is no version to
        accept and this refusal cannot be overruled from here. Usually the connection is not
        pointing at a PeerTube database, or the configured user cannot read its application table.
      </p>
      <p className="text-sm text-fg-muted">
        Check the source connection in this server&rsquo;s configuration. If you are certain the
        source is right, importing from a database this opaque has to be forced by a human on the
        server with{" "}
        <code className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-fg">
          peertube-import --force
        </code>
        , not from a browser.
      </p>
    </Card>
  );
}

// The mark a source-authoritative run carries wherever it is listed. "Why did
// that title change?" gets asked weeks later against a history of runs that
// otherwise look identical, so the answer has to be on the run itself.
function CutoverBadge({ run }: { run: PeerTubeImportRun }) {
  if (!run.source_authoritative) return null;
  return <Badge variant="warning">Cutover — source wins</Badge>;
}

// The mark a run's media mode carries wherever it is listed, for exactly the
// reason CutoverBadge above carries the cutover one: "why is my object store
// this large?" and "why does nothing play?" are asked weeks later, against a
// history of runs that otherwise look identical, and the answer has to be on
// the run itself. Unlike the cutover flag there is no unremarkable default to
// stay quiet about — every run handled media somehow — so this always renders,
// including the admission that a pre-#141 run never recorded which way it went.
function MediaModeBadge({ run }: { run: PeerTubeImportRun }) {
  const label = run.media_mode ? RUN_MEDIA_MODE_LABELS[run.media_mode] : undefined;
  if (!label) return <Badge variant="neutral">Media mode not recorded</Badge>;
  // Reference is the one that ties this instance to storage it does not own.
  return <Badge variant={run.media_mode === "reference" ? "warning" : "neutral"}>{label}</Badge>;
}

// Videos that landed with NOTHING to play. Core counts the absence under
// `imported` — they were inserted and tallied as imported videos, so every
// other number on the report calls them a success and the gap only shows when
// somebody presses play. On an HLS-only source in copy mode that is every
// video, which is why this gets the failure banner's treatment rather than one
// more row in a table nobody reads to the bottom.
function noPlayableMedia(report: PeerTubeImportRun["report"]): number {
  return report?.entities?.video_no_media?.imported ?? 0;
}

function RunPanel({ run }: { run: PeerTubeImportRun }) {
  const inFlight = run.state === "pending" || run.state === "running";
  const isDryRun = run.mode === "dry_run";
  const modeLabel = isDryRun ? "Dry run" : "Import";
  // Per-entity failures, which the run's own state does not reflect.
  const failed = failedFamilies(run.report);
  const failedTotal = failed.reduce((n, f) => n + f.failed, 0);
  const noMedia = noPlayableMedia(run.report);

  return (
    <section aria-label="Import run" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-bold tracking-tight text-fg">
          {modeLabel} {isDryRun ? "preview" : "run"}
        </h2>
        <RunStateBadge run={run} />
        <CutoverBadge run={run} />
        <MediaModeBadge run={run} />
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

      {!inFlight && run.state !== "failed" && failedTotal > 0 ? (
        <div role="alert" className="flex flex-col gap-1 rounded-2xl bg-warning/15 p-3">
          <p className="text-sm font-semibold text-warning">
            {isDryRun ? "This preview" : "This run"} finished, but {formatCount(failedTotal)}{" "}
            {pluralize(failedTotal, "entry", "entries")} failed.
          </p>
          <p className="text-sm text-fg-muted">
            {failed.map((f) => `${f.kind} ${formatCount(f.failed)}`).join(" · ")}. Reaching the end
            is all the run state reports — check the server logs for these before treating the
            migration as complete.
          </p>
        </div>
      ) : null}

      {!inFlight && noMedia > 0 ? (
        <div role="alert" className="flex flex-col gap-1 rounded-2xl bg-warning/15 p-3">
          <p className="text-sm font-semibold text-warning">
            {formatCount(noMedia)} {pluralize(noMedia, "video", "videos")}{" "}
            {isDryRun ? "would arrive" : "arrived"} with nothing to play.
          </p>
          <p className="text-sm text-fg-muted">
            They count as imported videos and appear in the catalogue like any other — the absence
            shows up only when somebody presses play. This is what copy mode does to an HLS-only
            source: PeerTube hangs HLS renditions off the streaming playlist rather than the
            progressive files this importer copies, and only reference mode carries the HLS tree.
          </p>
        </div>
      ) : null}

      {run.report ? (
        <ReportView report={run.report} isDryRun={isDryRun} />
      ) : !inFlight && run.state !== "failed" ? (
        <p className="text-sm text-fg-muted">No report is available for this run.</p>
      ) : null}
    </section>
  );
}

function RunStateBadge({ run }: { run: PeerTubeImportRun }) {
  if (run.state === "failed") return <Badge variant="danger">Failed</Badge>;
  if (run.state === "running") return <Badge variant="accent">Running</Badge>;
  if (run.state === "pending") return <Badge variant="neutral">Pending</Badge>;
  // `done` is the state of the RUN, not of its contents: core finishes a run
  // that reached the end even when every entity inside it failed. A success
  // pill over that reads as a clean migration, so the report decides here.
  return failedFamilies(run.report).length > 0 ? (
    <Badge variant="warning">Finished with failures</Badge>
  ) : (
    <Badge variant="success">Done</Badge>
  );
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
        <EmptyState
          icon={<DownloadIcon size={24} />}
          title="No import runs yet"
          message="Launch a dry run to preview a migration."
        />
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
                <RunStateBadge run={run} />
                <CutoverBadge run={run} />
                <MediaModeBadge run={run} />
                <span className="ml-auto text-xs text-fg-muted">{relativeTime(run.created_at)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
