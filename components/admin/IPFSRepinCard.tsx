"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { IPFSRepinStatus } from "@/lib/api";
import { formatBytes, formatCount } from "@/lib/format";

const POLL_MS = 5_000;

const PHASE: Record<IPFSRepinStatus["phase"], { label: string; variant: BadgeVariant }> = {
  idle: { label: "Not run", variant: "neutral" },
  running: { label: "Running", variant: "accent" },
  paused: { label: "Paused", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
};

/**
 * Bulk re-pin of already-pinned videos to the playback-only set (Tier A). Videos
 * pinned before that change keep a larger root (download MP4s, vp9.webm); this
 * re-pins them through the normal pin path. Disk is only freed after the node's
 * garbage collection, which the copy below says plainly.
 */
export function IPFSRepinCard() {
  const [status, setStatus] = useState<IPFSRepinStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const active = status?.phase === "running" || status?.phase === "paused";

  useEffect(() => {
    const controller = new AbortController();
    api
      .getIPFSRepin(controller.signal)
      .then((next) => {
        setStatus(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && (err.status === 501 || err.status === 503)) {
          setUnavailable(true);
          return;
        }
        setError(errorMessage(err, "Could not load re-pin progress."));
      });
    return () => controller.abort();
  }, [tick]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [active]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.startIPFSRepin());
      setConfirming(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "A re-pin is already running."
          : errorMessage(err, "Could not start the re-pin."),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  if (unavailable) return null;

  const phase = PHASE[status?.phase ?? "idle"];
  const examined = status?.scanned ?? 0;
  const total = examined + (status?.remaining ?? 0);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold tracking-tight text-fg">Playback-only pins</h3>
        <Badge variant={phase.variant}>{phase.label}</Badge>
      </div>
      <p className="text-[13px] leading-relaxed text-fg-muted">
        Videos pinned before the playback-only change still hold their download files on the node.
        Re-pinning replaces each with a tree of just the files players use. Disk space is returned
        only after the node&apos;s garbage collection runs, so run it after this finishes, then measure.
      </p>

      {confirming ? (
        <div role="group" aria-label="Confirm re-pin" className="flex flex-col gap-2 rounded-xl bg-surface-muted p-3">
          <p className="text-sm text-fg">
            Re-pin every pinned video in small batches? Each video is briefly unpinned from
            playback while its tree is re-added, and the run pauses when the node is at its budget.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void start()} disabled={busy}>
              {busy ? "Starting…" : "Start re-pin"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setConfirming(true)} disabled={active || busy}>
            Re-pin existing videos to the playback-only set
          </Button>
        </div>
      )}

      {status && status.phase !== "idle" ? (
        <div className="flex flex-col gap-2">
          {active && total > 0 ? (
            <div
              role="progressbar"
              aria-label="Re-pin progress"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={examined}
              className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
            >
              <div className="h-full bg-accent" style={{ width: `${Math.round((examined / total) * 100)}%` }} />
            </div>
          ) : null}
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Re-pinned" value={formatCount(status.done)} />
            <Stat label="Already playback-only" value={formatCount(status.skipped)} />
            <Stat label="Remaining" value={formatCount(status.remaining + status.in_flight)} />
            <Stat label="Failed" value={formatCount(status.failed)} danger={status.failed > 0} />
          </dl>
          {status.blocked > 0 ? (
            <p className="text-xs text-fg-muted">
              {formatCount(status.blocked)} not re-admitted by the publication policy (for example
              backfill is off).
            </p>
          ) : null}
          {status.phase === "paused" && status.pause_reason ? (
            <p role="status" className="text-xs text-warning">
              Paused: {status.pause_reason.replace(/_/g, " ")}. It resumes by itself when space frees.
            </p>
          ) : null}
          <p className="text-xs text-fg-muted">
            Estimated saving once the node collects garbage: {formatBytes(status.bytes_saved_estimate)}
          </p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-muted">{label}</dt>
      <dd className={`mt-0.5 text-base font-bold tabular-nums ${danger ? "text-danger" : "text-fg"}`}>{value}</dd>
    </div>
  );
}
