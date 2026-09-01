"use client";

import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { MediaGCConfig, MediaGCResponse } from "@/lib/api";
import { formatCount } from "@/lib/format";

// The user must type this exact word to arm the destructive purge (double-confirm).
const CONFIRM_WORD = "PURGE";
// The word for adopting a bucket over another install's marker (conflict only) —
// deliberately different from PURGE so muscle memory from one cannot arm the other.
const ADOPT_WORD = "ADOPT";
// How many orphan keys are rendered as DOM nodes. A breaker-tripped sweep on a
// real library carries tens of thousands of keys, which as <li> nodes hangs the
// tab; past the cap the full set is offered as a text download instead.
const ORPHAN_RENDER_CAP = 500;

// AdminMediaView is the admin-only media garbage-collection panel. A dry run
// (POST /admin/media/gc, dry_run=true) lists the orphaned storage objects with no
// database reference; a confirmed purge (dry_run=false) deletes them, behind a
// double confirmation (arm, then type PURGE). Every sweep is audited server-side.
// Role-gated by RoleGate — an under-privileged/anonymous viewer sees the shared
// permission prompt and nothing runs.
export function AdminMediaView() {
  return (
    <RoleGate minRole="admin" action="run media garbage collection">
      <MediaGCPanel />
    </RoleGate>
  );
}

type Phase = "idle" | "scanning" | "purging" | "adopting";

// Exported for the component test, which drives the panel directly rather than
// through RoleGate's session plumbing.
export function MediaGCPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  // The most recent dry-run result (the would-delete preview). Cleared once a
  // purge completes (the orphans are gone) or a new dry run starts.
  const [preview, setPreview] = useState<MediaGCResponse | null>(null);
  // The result of a completed purge (deleted count) — the success confirmation.
  const [purged, setPurged] = useState<MediaGCResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  // The collector's boot facts (GET /admin/media/gc). null on a backend that
  // predates the endpoint — the panel then renders exactly as it did before,
  // because an absent answer is not a fact about the sweep.
  const [config, setConfig] = useState<MediaGCConfig | null>(null);

  const busy = phase !== "idle";

  useEffect(() => {
    const ctrl = new AbortController();
    api.getMediaGCConfig(ctrl.signal).then(
      (cfg) => setConfig(cfg),
      () => {
        // Older backend, GC not wired, or unmount: quietly show nothing.
      },
    );
    return () => ctrl.abort();
  }, []);

  const dryRun = useCallback(async () => {
    setPhase("scanning");
    setError(null);
    setPurged(null);
    setArmed(false);
    setConfirmText("");
    try {
      const res = await api.runMediaGC(true);
      setPreview(res);
    } catch (err) {
      setError(gcError(err));
    } finally {
      setPhase("idle");
    }
  }, []);

  const purge = useCallback(async () => {
    setPhase("purging");
    setError(null);
    try {
      const res = await api.runMediaGC(false);
      setPurged(res);
      // A purge a safety rail downgraded deleted nothing, so every orphan is
      // still there: keep the list on screen instead of clearing it, because the
      // next question after "it refused" is always "what would it have deleted?".
      setPreview(res.dry_run ? res : null);
      setArmed(false);
      setConfirmText("");
    } catch (err) {
      setError(gcError(err));
    } finally {
      setPhase("idle");
    }
  }, []);

  // adoptBucket writes this instance's identity into the store's .vidra/owner
  // marker (POST /admin/media/gc/adopt-bucket). On success the response carries
  // the post-adoption ownership; reflect it immediately, then re-run the dry
  // run so every panel re-reads the new state off a fresh sweep.
  const adoptBucket = useCallback(async () => {
    setPhase("adopting");
    setError(null);
    let ownership: MediaGCResponse["bucket_ownership"];
    try {
      const res = await api.adoptMediaGCBucket();
      ownership = res.bucket_ownership;
    } catch (err) {
      setError(adoptError(err));
      setPhase("idle");
      return;
    }
    setConfig((cfg) => (cfg ? { ...cfg, bucket_ownership: ownership } : cfg));
    setPhase("idle");
    await dryRun();
  }, [dryRun]);

  const orphanCount = preview?.orphans.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {config ? <BootFacts config={config} /> : null}

      <Card className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          Garbage collection sweeps stored media objects (originals, thumbnails,
          storyboards, captions, the HLS tree, playlist covers) and finds those with no
          database reference. This panel sweeps by hand: start with a dry run — a manual
          purge deletes nothing until you confirm it. When media GC is enabled, a daily
          automatic sweep also deletes orphans on its own; the first sweep after each
          boot is always a dry run. Every sweep, manual or automatic, is audited.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void dryRun()} disabled={busy}>
            {phase === "scanning" ? "Scanning…" : "Run dry run"}
          </Button>
          {phase === "scanning" ? <Spinner label="Scanning storage" /> : null}
        </div>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {purged ? (
        <PurgeResult
          res={purged}
          breakerLimit={config?.max_orphan_percent}
          busy={busy}
          adopting={phase === "adopting"}
          onAdopt={adoptBucket}
        />
      ) : null}

      {preview ? (
        <section aria-label="Dry-run result" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="neutral">Dry run</Badge>
            <span className="text-fg-muted">
              Scanned {formatCount(preview.scanned)} stored{" "}
              {preview.scanned === 1 ? "object" : "objects"} —
            </span>
            <span className="font-medium text-fg">
              {formatCount(orphanCount)} {orphanCount === 1 ? "orphan" : "orphans"} to delete
            </span>
            <OwnershipBadge ownership={preview.bucket_ownership} />
          </div>

          {/* The dry run already carries the ownership answer, so the admin
              learns a purge would be refused BEFORE typing PURGE — no second
              request, and nothing to show when the field is absent. */}
          {ownershipBlocksDelete(preview.bucket_ownership) ? (
            <Alert
              variant="warning"
              as="div"
              data-testid="gc-ownership-advisory"
              className="flex flex-col gap-1.5"
            >
              <strong className="font-semibold">
                A purge would be refused here — it would delete nothing.
              </strong>
              <span>
                Object-store ownership is{" "}
                <span className="font-mono">{preview.bucket_ownership}</span>.{" "}
                {ownershipExplanation(preview.bucket_ownership)}
              </span>
              <AdoptBucketAction
                ownership={preview.bucket_ownership}
                busy={busy}
                adopting={phase === "adopting"}
                onAdopt={adoptBucket}
              />
            </Alert>
          ) : null}

          {orphanCount === 0 ? (
            <Card>
              <p className="text-sm text-fg-muted">
                No orphaned objects — storage is clean, nothing to purge.
              </p>
            </Card>
          ) : (
            <>
              <div className="max-h-72 overflow-auto rounded-xl border border-border-subtle">
                <ul className="divide-y divide-border-subtle">
                  {preview.orphans.slice(0, ORPHAN_RENDER_CAP).map((key) => (
                    <li
                      key={key}
                      className="px-3 py-1.5 font-mono text-xs break-all text-fg-muted"
                    >
                      {key}
                    </li>
                  ))}
                  {orphanCount > ORPHAN_RENDER_CAP ? (
                    <li className="px-3 py-1.5 text-xs text-fg-muted">
                      …and {formatCount(orphanCount - ORPHAN_RENDER_CAP)} more — download the
                      full list below.
                    </li>
                  ) : null}
                </ul>
              </div>

              {orphanCount > ORPHAN_RENDER_CAP ? (
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => downloadOrphanList(preview.orphans)}
                  >
                    Download full list ({formatCount(orphanCount)} keys)
                  </Button>
                </div>
              ) : null}

              {!armed ? (
                <div>
                  <Button variant="danger" onClick={() => setArmed(true)} disabled={busy}>
                    Purge {formatCount(orphanCount)} {orphanCount === 1 ? "orphan" : "orphans"}
                  </Button>
                </div>
              ) : (
                <Card className="flex flex-col gap-3 border-danger-border">
                  <p className="text-sm text-fg">
                    This permanently deletes the {formatCount(orphanCount)} object
                    {orphanCount === 1 ? "" : "s"} listed above from storage. This cannot be
                    undone. Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to
                    confirm.
                  </p>
                  <Input
                    label={`Type ${CONFIRM_WORD} to confirm`}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    className="max-w-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      onClick={() => void purge()}
                      disabled={busy || confirmText !== CONFIRM_WORD}
                    >
                      {phase === "purging" ? "Purging…" : "Confirm permanent purge"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setArmed(false);
                        setConfirmText("");
                      }}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

// What actually became of a REQUESTED purge (dry_run=false). The response's own
// `dry_run`/`mode` describe the sweep that ran, which is not necessarily the one
// that was asked for: four safety rails downgrade a delete to a dry run and
// report 200 with a full orphan list. Reading `deleted` alone is how "Purge
// complete · Deleted 0 objects" came to mean "your GC has been neutered for
// months".
type PurgeOutcome = "deleted" | "breaker" | "forced" | "downgraded";

function purgeOutcome(res: MediaGCResponse): PurgeOutcome {
  if (res.breaker_tripped) return "breaker";
  if (res.forced_dry_run) return "forced";
  // A delete that came back as a dry run without naming a rail: a rail this
  // build does not know about. Still not a success.
  if (res.dry_run) return "downgraded";
  return "deleted";
}

// PurgeResult reports a completed purge REQUEST. Only an outcome that actually
// deleted is allowed to look like a success.
function PurgeResult({
  res,
  breakerLimit,
  busy,
  adopting,
  onAdopt,
}: {
  res: MediaGCResponse;
  /** MEDIA_GC_MAX_ORPHAN_PERCENT when the boot facts answered; undefined otherwise. */
  breakerLimit?: number;
  busy: boolean;
  adopting: boolean;
  onAdopt: () => Promise<void>;
}) {
  const outcome = purgeOutcome(res);

  return (
    <Card className="flex flex-col gap-3">
      {outcome === "deleted" ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="success">Purge complete</Badge>
            <span className="text-sm text-fg">
              Deleted {formatCount(res.deleted)} {res.deleted === 1 ? "object" : "objects"}.
            </span>
          </div>
          <p className="text-sm text-fg-muted">
            Scanned {formatCount(res.scanned)} stored{" "}
            {res.scanned === 1 ? "object" : "objects"}.
          </p>
        </div>
      ) : null}

      {outcome === "breaker" ? (
        <Alert
          variant="danger"
          as="div"
          data-testid="gc-breaker-tripped"
          className="flex flex-col gap-1.5"
        >
          <strong className="font-semibold">
            Purge stopped by the safety breaker — nothing was deleted.
          </strong>
          <span>
            {formatCount(res.orphans.length)} of the {formatCount(res.scanned)} objects scanned
            looked like orphans (
            {breakerLimit === undefined
              ? `${res.orphan_percent}%`
              : `${res.orphan_percent}% found, limit ${breakerLimit}%`}
            ), over this instance&rsquo;s MEDIA_GC_MAX_ORPHAN_PERCENT limit. An implausible
            orphan share is the shape a wrong reference set makes, so the sweep refused the
            delete instead of acting on it. Confirm the list below really is garbage before
            raising the limit.
          </span>
        </Alert>
      ) : null}

      {outcome === "forced" || outcome === "downgraded" ? (
        <Alert
          variant="warning"
          as="div"
          data-testid="gc-forced-dry-run"
          className="flex flex-col gap-1.5"
        >
          <strong className="font-semibold">
            Purge downgraded to a dry run — nothing was deleted.
          </strong>
          <span>
            Safety rail: <span className="font-mono">{res.forced_dry_run_reason ?? "unreported"}</span>.{" "}
            {forcedDryRunHint(res.forced_dry_run_reason)}
          </span>
          <span className="text-fg-muted">
            The sweep itself succeeded: it scanned {formatCount(res.scanned)} objects and found{" "}
            {formatCount(res.orphans.length)} {res.orphans.length === 1 ? "orphan" : "orphans"},
            all of which are still in storage.
          </span>
          {/* Adoption is the documented way out of the bucket_ownership rail —
              but only that rail: adopting cannot end a storage migration. */}
          {res.forced_dry_run_reason === "bucket_ownership" ? (
            <AdoptBucketAction
              ownership={res.bucket_ownership}
              busy={busy}
              adopting={adopting}
              onAdopt={onAdopt}
            />
          ) : null}
        </Alert>
      ) : null}

      {res.mode || res.bucket_ownership || outcome !== "deleted" ? (
        <div
          data-testid="gc-result-context"
          className="flex flex-wrap items-center gap-2 text-xs text-fg-muted"
        >
          {res.mode ? <Badge variant="neutral">Mode: {res.mode}</Badge> : null}
          <OwnershipBadge ownership={res.bucket_ownership} />
          {outcome === "deleted" ? null : (
            <span>
              Scanned {formatCount(res.scanned)}, deleted {formatCount(res.deleted)}.
            </span>
          )}
        </div>
      ) : null}
    </Card>
  );
}

// The ownership pill. Absent on a backend that predates the field — the panel
// says nothing rather than guessing. "not-applicable" is rendered in operator
// words ("local disk"); the raw enum stays reachable in the title attribute.
function OwnershipBadge({ ownership }: { ownership?: MediaGCResponse["bucket_ownership"] }) {
  if (!ownership) return null;
  return (
    <Badge variant={OWNERSHIP_VARIANT[ownership] ?? "neutral"} title={ownership}>
      Storage: {ownershipLabel(ownership)}
    </Badge>
  );
}

// Every state except not-applicable is already an operator word; not-applicable
// is jargon for "media lives on local disk, which needs no ownership marker".
function ownershipLabel(ownership: MediaGCResponse["bucket_ownership"]): string {
  return ownership === "not-applicable" ? "local disk" : ownership;
}

// Only `owned` and `not-applicable` permit deletion (mediagc.BucketOwnership.
// AllowsDelete). The other three each block it, and `unknown` blocks it on
// purpose: forgetting to resolve ownership has to mean "GC stops deleting".
const OWNERSHIP_VARIANT: Record<MediaGCResponse["bucket_ownership"], BadgeVariant> = {
  owned: "success",
  "not-applicable": "neutral",
  unowned: "warning",
  unknown: "warning",
  conflict: "danger",
};

function ownershipBlocksDelete(ownership?: MediaGCResponse["bucket_ownership"]): boolean {
  // An absent field is not a blocked state — it is no answer at all.
  return ownership === "unowned" || ownership === "conflict" || ownership === "unknown";
}

function ownershipExplanation(ownership?: MediaGCResponse["bucket_ownership"]): string {
  switch (ownership) {
    case "unowned":
      return "The store carries no ownership marker and was not empty, so whose media is in it has never been established. Adopt the bucket — that writes this instance's identity into the store's .vidra/owner marker — or point this instance at the store it actually owns.";
    case "conflict":
      return "The .vidra/owner marker names another Vidra instance, which believes this store is its own. Two instances sweeping one store delete each other's media, so settle which one owns it before purging.";
    case "unknown":
      return "This instance never resolved whether the store is its own, and an unresolved answer refuses deletion by design. Check the API's storage configuration and startup logs, then re-run the sweep.";
    default:
      return "";
  }
}

// The plain-English half of a forced dry run; the machine reason is printed
// verbatim next to it so an operator can search for it.
function forcedDryRunHint(reason?: MediaGCResponse["forced_dry_run_reason"]): string {
  switch (reason) {
    case "bucket_ownership":
      return "The object store is not established as this instance's, so destructive sweeps are refused. Adopt the bucket — that writes this instance's identity into the store's .vidra/owner marker — or fix the storage configuration, then purge again.";
    case "storage_migration_active":
      return "A storage migration campaign is in flight, so the two stores are deliberately out of step and an object with no database reference is not evidence about either of them (an unanswerable migration check counts as one running). Wait for the campaign to finish, or cancel it, then purge again.";
    default:
      return "A safety rail refused the delete. Nothing was removed from storage.";
  }
}

// gcError maps an API failure to an honest message. The 503 (storage backend can't
// list) is the one worth calling out specifically.
function gcError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503) {
      return "Garbage collection is unavailable: this storage backend can't list objects.";
    }
    return err.message;
  }
  return "Media garbage collection failed. Please try again.";
}

// adoptError maps the adopt-bucket failure modes (audited core-side) to what an
// operator can act on: 503 = the instance has no identity to stamp yet, 502 =
// the marker write itself failed, and 409 = one of TWO opposite refusals that
// the status code alone cannot tell apart, so this reads `code`:
//
//   conflict             media lives on local disk; there is no bucket at all.
//   foreign_media_layout the bucket is full of ANOTHER live instance's media.
//
// Collapsing both into the local-disk sentence answered a reference-mode
// operator's "why was my adoption refused?" with a fact about a disk that is
// not involved, and sent them looking in the wrong place. An unrecognised 409
// falls through to the server's own message rather than guessing at either.
function adoptError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.code === "foreign_media_layout") {
      // No `force` escape hatch is offered here on purpose: the override arms
      // an irreversible sweep against media a live instance is still serving,
      // and the sweep-level rule that would make it safe does not exist yet.
      // The two remedies below are the ones that cannot destroy someone's
      // library, so they are the only ones this panel names.
      return "Adoption refused: this instance references media stored under another system's key layout — the signature of a reference-mode import, where storage points at the SOURCE instance's own bucket. That instance is most likely still serving those files, and adopting the bucket would let garbage collection delete them. Copy the media into a bucket this instance owns, or retire the source instance first, then adopt.";
    }
    if (err.status === 409 && err.code === "conflict") {
      return "Nothing to adopt: this instance stores media on local disk, which needs no ownership marker.";
    }
    if (err.status === 503) {
      return "Adoption failed: this instance has no identity to stamp on the bucket yet — run the database migrations against this database, then try again.";
    }
    if (err.status === 502) {
      return "Adoption failed: the ownership marker could not be written to the object store. Check the storage credentials and connectivity, then try again.";
    }
    return err.message;
  }
  return "Bucket adoption failed. Please try again.";
}

// BootFacts — the read-only facts block at the top of the page (the same dl/Row
// idiom the system-status and infrastructure pages use). Both knobs are
// deliberately boot-baked, so there is no toggle here and never should be:
// this block exists because boot-baked must not mean invisible.
function BootFacts({ config }: { config: MediaGCConfig }) {
  return (
    <section aria-label="Media GC configuration" data-testid="gc-boot-facts">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <FactRow
          label="Automatic daily sweep"
          value={config.enabled ? "On" : "Off"}
          detail="set at boot via MEDIA_GC_ENABLED"
        />
        <FactRow label="Orphan-ratio breaker" value={`${config.max_orphan_percent}%`} />
        <FactRow
          label="Storage ownership"
          value={ownershipLabel(config.bucket_ownership)}
          title={config.bucket_ownership}
        />
      </dl>
    </section>
  );
}

function FactRow({
  label,
  value,
  detail,
  title,
}: {
  label: string;
  value: string;
  detail?: string;
  title?: string;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-border-subtle py-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right text-fg" title={title}>
        {value}
        {detail ? <span className="text-fg-muted"> — {detail}</span> : null}
      </dd>
    </div>
  );
}

// AdoptBucketAction — the "Adopt this bucket" control the advisory copy has
// been promising. Rendered ONLY for `unowned` (no marker: arm, then confirm)
// and `conflict` (another install's marker: arm, then type ADOPT — overwriting
// a marker takes ownership away from a live install, so the loud path stays
// loud). Never for `unknown` (its remedy is configuration and logs, not a
// marker write) and never on a healthy install.
function AdoptBucketAction({
  ownership,
  busy,
  adopting,
  onAdopt,
}: {
  ownership?: MediaGCResponse["bucket_ownership"];
  busy: boolean;
  adopting: boolean;
  onAdopt: () => Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  if (ownership !== "unowned" && ownership !== "conflict") return null;
  const conflict = ownership === "conflict";

  if (!armed) {
    return (
      <div>
        <Button variant="secondary" size="sm" onClick={() => setArmed(true)} disabled={busy}>
          Adopt this bucket
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {conflict ? (
        <span className="text-fg">
          Adopting overwrites the other install&rsquo;s{" "}
          <span className="font-mono">.vidra/owner</span> marker and takes ownership of the
          store away from it — its destructive sweeps will start refusing while yours
          delete. Settle which instance owns this store first; only if THIS instance is
          the rightful owner, type <span className="font-mono font-semibold">{ADOPT_WORD}</span>{" "}
          to confirm.
        </span>
      ) : (
        <span className="text-fg">
          Adopting writes this instance&rsquo;s identity into the store&rsquo;s{" "}
          <span className="font-mono">.vidra/owner</span> marker, and every future
          destructive sweep will trust it. Only adopt a store this instance really owns.
        </span>
      )}
      {conflict ? (
        <Input
          label={`Type ${ADOPT_WORD} to confirm`}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          className="max-w-xs"
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          size="sm"
          onClick={() => void onAdopt()}
          disabled={busy || (conflict && confirmText !== ADOPT_WORD)}
        >
          {adopting ? "Adopting…" : "Confirm adoption"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setArmed(false);
            setConfirmText("");
          }}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// downloadOrphanList hands the FULL orphan set over as a plain-text file (one
// key per line) — the DOM renders at most ORPHAN_RENDER_CAP of them.
function downloadOrphanList(keys: string[]) {
  const blob = new Blob([keys.join("\n") + "\n"], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "media-gc-orphans.txt";
  a.click();
  URL.revokeObjectURL(url);
}
