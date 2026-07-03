"use client";

import { useCallback, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
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

function MediaGCPanel() {
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
      setPreview(null);
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

      {purged ? (
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="success">Purge complete</Badge>
            <span className="text-sm text-fg">
              Deleted {formatCount(purged.deleted)}{" "}
              {purged.deleted === 1 ? "object" : "objects"}.
            </span>
          </div>
          <p className="text-sm text-fg-muted">
            Scanned {formatCount(purged.scanned)} stored{" "}
            {purged.scanned === 1 ? "object" : "objects"}.
          </p>
        </Card>
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
          </div>

          {orphanCount === 0 ? (
            <Card>
              <p className="text-sm text-fg-muted">
                No orphaned objects — storage is clean, nothing to purge.
              </p>
            </Card>
          ) : (
            <>
              <div className="max-h-72 overflow-auto rounded-lg border border-border-subtle">
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
                <Card className="flex flex-col gap-3 border-danger">
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
