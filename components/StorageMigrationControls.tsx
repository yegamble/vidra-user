"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import type { BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { api, errorMessage } from "@/lib/api";
import type {
  StorageMigration,
  StorageMigrationPreview,
  StorageMigrationState,
} from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useSettledSession } from "@/lib/use-settled-session";

/**
 * The operator's controls for a media-store migration.
 *
 * A34 found this page rendering a read-only campaign list: starting and
 * cancelling were API-only, and the rest of the verbs did not exist at all. A
 * move is the most destructive thing an instance does to itself, and "start it
 * from a runbook and watch a progress bar" is not an operator interface.
 *
 * THE DOCTRINE IS THE GC PAGE'S, because the two surfaces are the same shape of
 * risk: dry run first, so the consequence is visible before it is chosen; a
 * typed PURGE for the one action that deletes; and a refusal that says WHY,
 * with the state it was refused from, because the commonest cause is a stale
 * page.
 *
 * WHAT A BROWSER STILL CANNOT DO, stated plainly rather than hidden behind a
 * disabled button: cutover is an environment swap plus a restart. Which store a
 * process serves from is decided by the environment it started with, so the
 * "Record the cutover" button records one that HAS happened and refuses, with a
 * reason, when it has not. That is the honest half of it — the operator learns
 * at once whether their swap took, instead of watching a sweep for a minute.
 */

/** The word an operator types to remove the destination's partial copies. */
const PURGE_WORD = "PURGE";

/** Campaign states nothing further happens from. */
export const TERMINAL_MIGRATION_STATES = new Set<StorageMigrationState>([
  "done",
  "cancelled",
  "failed",
]);

/**
 * Operator-facing phase names. Exhaustive over the contract's union on purpose:
 * a phase added core-side becomes a type error here rather than a raw
 * snake_case string leaking into the page.
 */
export const MIGRATION_STATE_LABEL: Record<StorageMigrationState, string> = {
  enumerating: "Listing the source",
  copying: "Copying",
  synced: "Synced — ready to cut over",
  paused: "Paused",
  aborting: "Aborting — clearing the destination",
  cutover: "Cut over — grace period running",
  deleting_source: "Deleting the old copies",
  done: "Done",
  cancelled: "Cancelled",
  failed: "Failed",
};

export const MIGRATION_STATE_VARIANT: Record<StorageMigrationState, BadgeVariant> = {
  enumerating: "accent",
  copying: "accent",
  // The one phase that is waiting on a human: everything is verified in the
  // destination and the operator has to swap the environment and restart.
  synced: "warning",
  // Paused is a warning and not a danger: nothing is wrong with the instance,
  // and nothing is being lost. What has stopped is the move.
  paused: "warning",
  aborting: "danger",
  cutover: "accent",
  deleting_source: "accent",
  done: "success",
  cancelled: "neutral",
  failed: "danger",
};

/**
 * Why a paused campaign is paused, in the operator's terms. The distinction
 * these two sentences draw is the ruling: a write-denied TARGET used to be a
 * fatal boot refusal that took the whole instance down, and the first thing an
 * operator must learn now is that their instance is fine.
 */
const PAUSE_REASON_NOTE: Record<string, string> = {
  target_write_denied:
    "The destination store refused a write probe, so copying stopped. This instance is otherwise unaffected — it is still serving every read from the store that holds authority, and nothing has been deleted. Fix the destination's credential or permissions; copying resumes on its own within five minutes, or immediately if you resume it below.",
  operator: "You paused this campaign. Nothing is being copied and nothing is being deleted.",
};

type Busy =
  | null
  | "preview"
  | "start"
  | "pause"
  | "resume"
  | "abort"
  | "switch"
  | "release";

export function StorageMigrationControls({
  campaign,
  onChanged,
}: {
  /** The live campaign, or null when none is running. */
  campaign: StorageMigration | null;
  /** Called with the campaign every control returns, so the panel re-renders. */
  onChanged: (next: StorageMigration) => void;
}) {
  const { settled, viewerKey } = useSettledSession();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StorageMigrationPreview | null>(null);
  const [armedPurge, setArmedPurge] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  // The detail read's answer, tagged with the campaign it belongs to. Tagging
  // rather than clearing on change is what keeps the effect free of a
  // setState-on-mount: a stale answer is filtered at render, where it is one
  // comparison, instead of being blanked in an effect that then re-runs.
  const [detail, setDetail] = useState<StorageMigration | null>(null);

  const campaignId = campaign?.id ?? null;
  const campaignUpdated = campaign?.updated_at ?? null;

  // The DETAIL read, which is the only one that carries the per-category
  // failure breakdown. It is viewer-scoped (admin-only), so it waits for the
  // session to settle: fired from a bare mount effect it would leave without an
  // Authorization header and come back 401, and the effect would never re-run.
  useEffect(() => {
    if (!settled || !campaignId) return;
    const controller = new AbortController();
    api
      .getStorageMigration(campaignId, controller.signal)
      .then((res) => setDetail(res))
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        // A failed detail read costs the failure table and nothing else; the
        // campaign card around it is already rendered from the list.
        setDetail(null);
      });
    return () => controller.abort();
  }, [settled, viewerKey, campaignId, campaignUpdated]);

  const run = useCallback(
    async (what: Busy, call: () => Promise<StorageMigration>) => {
      setBusy(what);
      setError(null);
      try {
        onChanged(await call());
        setArmedPurge(false);
        setConfirmText("");
      } catch (err: unknown) {
        setError(errorMessage(err));
      } finally {
        setBusy(null);
      }
    },
    [onChanged],
  );

  const runPreview = useCallback(async () => {
    setBusy("preview");
    setError(null);
    try {
      setPreview(await api.previewStorageMigration());
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }, []);

  if (!campaign) {
    return (
      <StartCard
        busy={busy}
        error={error}
        preview={preview}
        onPreview={() => void runPreview()}
        onStart={() => void run("start", () => api.startStorageMigration())}
        onDismiss={() => setPreview(null)}
      />
    );
  }

  const terminal = TERMINAL_MIGRATION_STATES.has(campaign.state);
  const id = campaign.id;
  const failures = detail?.id === campaign.id ? (detail.failures ?? []) : [];
  const { objects_total: total, objects_done: done } = campaign;
  const percent = total > 0 ? (done / total) * 100 : 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold tracking-tight">Storage migration</h3>
        <Badge variant={MIGRATION_STATE_VARIANT[campaign.state]} status>
          {MIGRATION_STATE_LABEL[campaign.state]}
        </Badge>
      </div>
      {/* Store IDENTITY strings, never credentials — "s3://<endpoint>/<bucket>"
          or "local:<path>". They are what the api compares its own backends
          against, so showing them verbatim is what makes a half-done cutover
          legible. */}
      <p className="font-mono text-[13px] break-all text-fg-muted">
        {campaign.source_desc} → {campaign.target_desc}
      </p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span>
            {total > 0
              ? `${done.toLocaleString()} of ${total.toLocaleString()} objects verified`
              : "Counting objects in the source"}
          </span>
          {total > 0 ? (
            <span className="tabular-nums">{Math.round(percent)}%</span>
          ) : null}
        </div>
        <ProgressBar value={percent} label="Storage migration progress" />
      </div>

      {campaign.state === "paused" && campaign.paused_reason ? (
        <p className="text-[13px] text-warning">
          {PAUSE_REASON_NOTE[campaign.paused_reason] ?? campaign.last_error}
          {campaign.resume_state ? (
            <>
              {" "}
              Resuming returns it to{" "}
              <span className="font-medium">
                {MIGRATION_STATE_LABEL[campaign.resume_state].toLowerCase()}
              </span>
              .
            </>
          ) : null}
        </p>
      ) : null}

      {campaign.objects_failed > 0 ? (
        <p className="text-[13px] text-danger">
          {campaign.objects_failed.toLocaleString()} object
          {campaign.objects_failed === 1 ? "" : "s"} dead-lettered. They do not
          block the campaign, but their bytes are not in the destination.
        </p>
      ) : null}
      {campaign.last_error && campaign.state !== "paused" ? (
        <p className="text-[13px] text-warning">{campaign.last_error}</p>
      ) : null}

      <FailureTable failures={failures} />

      {error ? <p className="text-[13px] text-danger">{error}</p> : null}

      {terminal ? (
        <p className="text-[13px] text-fg-muted">
          Finished {formatDateTime(campaign.updated_at)}.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {campaign.state === "paused" ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  void run("resume", () => api.resumeStorageMigration(id))
                }
              >
                {busy === "resume" ? "Resuming…" : "Resume"}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy !== null || campaign.state === "aborting"}
                onClick={() => void run("pause", () => api.pauseStorageMigration(id))}
              >
                {busy === "pause" ? "Pausing…" : "Pause"}
              </Button>
            )}
            {/* STEP ONE of the cutover, and the button cannot perform its own
                first half — the operator swaps the environment and restarts,
                then presses this. It refuses with a reason when the swap has
                not taken, which is the whole value over waiting a minute. */}
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null || !CAN_SWITCH.has(campaign.state)}
              onClick={() =>
                void run("switch", () => api.switchStorageMigrationAuthority(id))
              }
            >
              {busy === "switch" ? "Recording…" : "Record the cutover"}
            </Button>
            {/* STEP TWO, deliberately separate: this is the act that makes the
                move irreversible, and it must never be a consequence of the
                one above. */}
            <Button
              variant="danger"
              size="sm"
              disabled={busy !== null || campaign.state !== "cutover"}
              onClick={() =>
                void run("release", () => api.releaseStorageMigrationSource(id))
              }
            >
              {busy === "release" ? "Releasing…" : "Release the old store"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void run("abort", () => api.abortStorageMigration(id))
              }
            >
              {busy === "abort" && !armedPurge ? "Aborting…" : "Abort"}
            </Button>
          </div>

          <p className="text-[13px] text-fg-muted">
            Cutting over is an environment change this page cannot make: point{" "}
            <span className="font-mono">STORAGE_*</span> at the new store and{" "}
            <span className="font-mono">STORAGE_MIGRATION_TARGET_*</span> at the
            old one, restart, then record it here. See &ldquo;Moving the media
            store&rdquo; in the operations guide.{" "}
            <Link
              href="/admin/jobs"
              className="font-medium text-accent-text hover:underline"
            >
              Follow the per-object queue in Jobs
            </Link>
          </p>

          {CAN_CLEAN.has(campaign.state) ? (
            <AbortWithCleanup
              armed={armedPurge}
              busy={busy !== null}
              confirmText={confirmText}
              onArm={() => setArmedPurge(true)}
              onCancel={() => {
                setArmedPurge(false);
                setConfirmText("");
              }}
              onConfirmTextChange={setConfirmText}
              onConfirm={() =>
                void run("abort", () =>
                  api.abortStorageMigration(id, {
                    cleanDestination: true,
                    confirm: PURGE_WORD,
                  }),
                )
              }
            />
          ) : null}
        </div>
      )}
    </Card>
  );
}

/** States a cutover can be RECORDED from (core's own guard, mirrored). */
const CAN_SWITCH = new Set<StorageMigrationState>(["copying", "synced"]);

/**
 * States the destination may be cleaned from. After cutover the destination is
 * the store this instance SERVES from, so cleaning it would empty the live
 * library — core refuses it, and the button is not offered.
 */
const CAN_CLEAN = new Set<StorageMigrationState>([
  "enumerating",
  "copying",
  "synced",
  "paused",
]);

/**
 * The failure breakdown, and the column that did not exist.
 *
 * `objects_failed` counts only objects whose whole attempt budget is spent, so
 * a campaign every object of which is being refused reported zero failures and
 * no error for as long as the retry ladder took — an operator watched progress
 * stall and was told nothing. "Retrying" is that half.
 */
function FailureTable({
  failures,
}: {
  failures: NonNullable<StorageMigration["failures"]>;
}) {
  if (failures.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">
          Storage migration object failures by category
        </caption>
        <thead className="text-fg-muted">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">
              What failed
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">
              Retrying
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Given up on
            </th>
          </tr>
        </thead>
        <tbody>
          {failures.map((f) => (
            <tr key={f.category} className="border-t border-border-subtle">
              <td className="py-1 pr-3">{f.category}</td>
              <td className="py-1 pr-3 text-right tabular-nums">
                {f.retrying.toLocaleString()}
              </td>
              <td className="py-1 text-right tabular-nums text-danger">
                {f.terminal.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The destination clean-up, behind an arm-then-type confirmation.
 *
 * It is the only thing in the product that deletes from the DESTINATION, and it
 * is being asked for on the way OUT of a destructive operation, when an
 * operator is already rattled — which is exactly when a single-click button
 * gets pressed by accident. The GC page's own doctrine, applied unchanged.
 */
function AbortWithCleanup({
  armed,
  busy,
  confirmText,
  onArm,
  onCancel,
  onConfirmTextChange,
  onConfirm,
}: {
  armed: boolean;
  busy: boolean;
  confirmText: string;
  onArm: () => void;
  onCancel: () => void;
  onConfirmTextChange: (v: string) => void;
  onConfirm: () => void;
}) {
  if (!armed) {
    return (
      <div>
        <Button variant="danger" size="sm" onClick={onArm} disabled={busy}>
          Abort and clear the destination
        </Button>
      </div>
    );
  }
  return (
    <Card className="flex flex-col gap-3 border-danger-border">
      <p className="text-sm text-fg">
        This aborts the migration AND permanently deletes every copy it has
        already written to the destination store. The source is untouched and
        this instance keeps serving from it, so nothing you can watch will
        break — but the copied bytes are gone and a new campaign starts from
        zero. Type <span className="font-mono font-semibold">{PURGE_WORD}</span>{" "}
        to confirm.
      </p>
      <Input
        label={`Type ${PURGE_WORD} to confirm`}
        value={confirmText}
        onChange={(e) => onConfirmTextChange(e.target.value)}
        autoComplete="off"
        className="max-w-xs"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          size="sm"
          onClick={onConfirm}
          disabled={busy || confirmText !== PURGE_WORD}
        >
          Confirm abort and clear
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

/**
 * The start, with its dry run in front of it.
 *
 * "Start a storage migration" is a button whose consequence an operator cannot
 * otherwise see: how many objects, how many bytes, and which two stores. The
 * preview creates nothing, so saying no costs nothing — which is the only way
 * a confirmation is worth asking for.
 */
function StartCard({
  busy,
  error,
  preview,
  onPreview,
  onStart,
  onDismiss,
}: {
  busy: Busy;
  error: string | null;
  preview: StorageMigrationPreview | null;
  onPreview: () => void;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-sm font-bold tracking-tight">Move the media store</h3>
      <p className="text-[13px] text-fg-muted">
        Copies every object into the store{" "}
        <span className="font-mono">STORAGE_MIGRATION_TARGET_*</span> names,
        verifying each copy by reading it back. Nothing this instance serves
        changes while it runs, and the old store keeps its copies until you
        release it.
      </p>
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      {preview ? (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <p className="font-mono text-[13px] break-all text-fg-muted">
            {preview.source_desc} → {preview.target_desc}
          </p>
          <p className="text-[13px] text-fg">
            {preview.objects.toLocaleString()} object
            {preview.objects === 1 ? "" : "s"}
            {preview.bytes_known ? <> · {formatBytes(preview.bytes)}</> : null}{" "}
            would be copied.
            {preview.bytes_known ? null : (
              <>
                {" "}
                This store cannot report sizes cheaply, so the byte total is not
                shown — the count is exact.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={onStart}
              disabled={busy !== null}
            >
              {busy === "start" ? "Starting…" : "Start the migration"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onDismiss}
              disabled={busy !== null}
            >
              Not now
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onPreview}
            disabled={busy !== null}
          >
            {busy === "preview" ? "Counting…" : "Check what would be copied"}
          </Button>
        </div>
      )}
    </Card>
  );
}
