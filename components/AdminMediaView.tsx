"use client";

import { useCallback, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { MediaGCResponse } from "@/lib/api";
import { formatCount } from "@/lib/format";

// The user must type this exact word to arm the destructive purge (double-confirm).
const CONFIRM_WORD = "PURGE";

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

type Phase = "idle" | "scanning" | "purging";

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

  const busy = phase !== "idle";

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

  const orphanCount = preview?.orphans.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          Garbage collection sweeps stored media objects (originals, thumbnails,
          storyboards, captions, the HLS tree, playlist covers) and finds those with no
          database reference. Start with a dry run — nothing is deleted until you confirm
          a purge. Every sweep is audited.
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

      {purged ? <PurgeResult res={purged} /> : null}

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
                  {preview.orphans.map((key) => (
                    <li
                      key={key}
                      className="px-3 py-1.5 font-mono text-xs break-all text-fg-muted"
                    >
                      {key}
                    </li>
                  ))}
                </ul>
              </div>

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
function PurgeResult({ res }: { res: MediaGCResponse }) {
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
            looked like orphans ({res.orphan_percent}%), over this instance&rsquo;s
            MEDIA_GC_MAX_ORPHAN_PERCENT limit. An implausible orphan share is the shape a
            wrong reference set makes, so the sweep refused the delete instead of acting on
            it. Confirm the list below really is garbage before raising the limit.
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
// says nothing rather than guessing.
function OwnershipBadge({ ownership }: { ownership?: MediaGCResponse["bucket_ownership"] }) {
  if (!ownership) return null;
  return <Badge variant={OWNERSHIP_VARIANT[ownership] ?? "neutral"}>Storage: {ownership}</Badge>;
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
