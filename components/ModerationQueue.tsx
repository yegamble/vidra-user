"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { useSession } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { Report, ReportStatus } from "@/lib/api";
import { relativeTime } from "@/lib/format";

const MAX_NOTE_LEN = 2000;

type Status = "loading" | "error" | "ready";

// ModerationQueue is the moderator/admin view of the abuse-report queue,
// role-gated by RoleGate (an under-privileged/anonymous viewer sees the shared
// permission prompt and nothing fetches). Privileged viewers see the queue +
// resolve actions.
export function ModerationQueue() {
  return (
    <RoleGate minRole="moderator" action="review reports">
      <Queue />
    </RoleGate>
  );
}

function Queue() {
  const [status, setStatus] = useState<Status>("loading");
  const [reports, setReports] = useState<Report[]>([]);
  const [openOnly, setOpenOnly] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getReports({ openOnly, limit: 100 }, controller.signal)
      .then((res) => {
        setReports(res.reports);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [openOnly, reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  // Switch filter (re-triggers the fetch effect). Set loading here rather than in
  // the effect body so a stale list doesn't flash before the refetch resolves.
  const selectFilter = useCallback(
    (next: boolean) => {
      if (next === openOnly) return;
      setStatus("loading");
      setOpenOnly(next);
    },
    [openOnly],
  );

  // After a resolve, update the row's status locally so it drops out of the
  // open-only view immediately; a later refetch confirms persistence.
  const onResolved = useCallback((id: string, newStatus: ReportStatus) => {
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)),
    );
  }, []);

  // After an admin hard-delete the row is gone for good — drop it locally; a
  // later refetch confirms the purge persisted.
  const onDeleted = useCallback((id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const visible = openOnly ? reports.filter((r) => r.status === "open") : reports;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2" role="group" aria-label="Filter reports">
        <FilterButton active={openOnly} onClick={() => selectFilter(true)}>
          Open
        </FilterButton>
        <FilterButton active={!openOnly} onClick={() => selectFilter(false)}>
          All
        </FilterButton>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-24">
          <Spinner label="Loading reports" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load the moderation queue." onRetry={retry} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={openOnly ? "No open reports" : "No reports yet"}
          message={
            openOnly
              ? "Nothing to review right now. Reports filed by viewers will appear here."
              : "When viewers report a video or comment, it shows up here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((report) => (
            <li key={report.id}>
              <ReportRow report={report} onResolved={onResolved} onDeleted={onDeleted} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "focus-ring rounded-full border border-accent bg-accent px-4 py-1.5 text-[13px] font-semibold text-accent-fg transition-colors"
          : "focus-ring rounded-full border border-border px-4 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted"
      }
    >
      {children}
    </button>
  );
}

const STATUS_STYLE: Record<ReportStatus, string> = {
  open: "bg-warning/15 text-warning",
  accepted: "bg-success/15 text-success",
  rejected: "bg-surface-strong text-fg-muted",
};

type RowState = "idle" | "submitting";

function ReportRow({
  report,
  onResolved,
  onDeleted,
}: {
  report: Report;
  onResolved: (id: string, status: ReportStatus) => void;
  onDeleted: (id: string) => void;
}) {
  const { user } = useSession();
  const [note, setNote] = useState("");
  const [rowState, setRowState] = useState<RowState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [blockState, setBlockState] = useState<"idle" | "blocking" | "blocked">("idle");
  const [blockError, setBlockError] = useState<string | null>(null);
  const [deleteState, setDeleteState] = useState<"idle" | "confirm" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function resolve(status: "accepted" | "rejected") {
    if (rowState === "submitting") return;
    setRowState("submitting");
    setError(null);
    try {
      await api.resolveReport(report.id, { status, note: note.trim() || undefined });
      onResolved(report.id, status);
    } catch (err) {
      setError(errorMessage(err, "Could not resolve this report."));
      setRowState("idle");
    }
  }

  // Hard-delete a resolved report (admin only — moderators resolve but cannot
  // purge). Two-step confirm; the row is removed on the 204.
  async function hardDelete() {
    if (deleteState === "deleting") return;
    setDeleteState("deleting");
    setDeleteError(null);
    try {
      await api.deleteReport(report.id);
      onDeleted(report.id);
    } catch (err) {
      setDeleteError(errorMessage(err, "Could not delete this report."));
      setDeleteState("idle");
    }
  }

  // Block the reported video, recording the report's reason for the audit trail.
  // Independent of resolution — a moderator may block without resolving.
  async function blockVideo(videoId: string) {
    if (blockState === "blocking") return;
    setBlockState("blocking");
    setBlockError(null);
    try {
      await api.blockVideo(videoId, { reason: report.reason });
      setBlockState("blocked");
    } catch (err) {
      setBlockError(errorMessage(err, "Could not block this video."));
      setBlockState("idle");
    }
  }

  // Block the reported FEDERATED remote video (hides it from every local
  // surface), recording the report's reason. Same independence from resolution.
  async function blockRemoteVideo(remoteVideoId: string) {
    if (blockState === "blocking") return;
    setBlockState("blocking");
    setBlockError(null);
    try {
      await api.blockRemoteVideo(remoteVideoId, { reason: report.reason });
      setBlockState("blocked");
    } catch (err) {
      setBlockError(errorMessage(err, "Could not block this video."));
      setBlockState("idle");
    }
  }

  return (
    <article className="rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
        <span
          className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] ${STATUS_STYLE[report.status]}`}
        >
          {report.status}
        </span>
        <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-fg-muted">
          {/* "remote_video" reads as "remote video". */}
          {report.target_type.replace("_", " ")}
        </span>
        <span>
          by <span className="font-medium text-fg">{report.reporter.username}</span>
        </span>
        <span aria-hidden>·</span>
        <span>{relativeTime(report.created_at)}</span>
      </div>

      <ReportTarget report={report} />

      <p className="mt-2 text-sm text-fg-muted">
        <span className="font-semibold text-fg">Reason:</span> {report.reason}
      </p>

      {report.status !== "open" && report.moderator_note ? (
        <p className="mt-1 text-[13px] text-fg-muted">
          <span className="font-semibold text-fg">Note:</span> {report.moderator_note}
        </p>
      ) : null}

      {/* Hard-delete is an admin-only purge of a RESOLVED report (moderators
          resolve but cannot delete; open reports must be resolved first). */}
      {report.status !== "open" && user?.role === "admin" ? (
        <div className="mt-3 flex flex-col gap-1">
          {deleteState === "idle" ? (
            <Button
              variant="danger"
              size="sm"
              aria-label={`Delete this ${report.target_type.replace("_", " ")} report`}
              onClick={() => setDeleteState("confirm")}
              className="self-start"
            >
              Delete
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-fg-muted">
                Permanently delete this report? This cannot be undone.
              </span>
              <button
                type="button"
                disabled={deleteState === "deleting"}
                onClick={() => void hardDelete()}
                className="focus-ring rounded-full font-semibold text-danger transition-colors hover:text-danger/80 disabled:opacity-60"
              >
                {deleteState === "deleting" ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={deleteState === "deleting"}
                onClick={() => setDeleteState("idle")}
                className="focus-ring rounded-full font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          )}
          {deleteError ? <p className="text-sm text-danger">{deleteError}</p> : null}
        </div>
      ) : null}

      {report.status === "open" ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-fg-muted">
              Internal note (optional)
            </span>
            <textarea
              aria-label="Internal moderator note"
              rows={2}
              maxLength={MAX_NOTE_LEN}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
            />
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={rowState === "submitting"}
              onClick={() => void resolve("accepted")}
            >
              Accept
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={rowState === "submitting"}
              onClick={() => void resolve("rejected")}
            >
              Reject
            </Button>
            {report.target_type === "video" && report.video_id ? (
              blockState === "blocked" ? (
                <span className="inline-flex items-center gap-1 text-sm text-fg-muted">
                  Video blocked ·{" "}
                  <Link
                    href="/moderation/blocked"
                    className="focus-ring rounded-sm underline transition-colors hover:text-fg"
                  >
                    Manage
                  </Link>
                </span>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={blockState === "blocking"}
                  onClick={() => void blockVideo(report.video_id as string)}
                >
                  {blockState === "blocking" ? "Blocking…" : "Block video"}
                </Button>
              )
            ) : null}
            {report.target_type === "remote_video" && report.remote_video_id ? (
              blockState === "blocked" ? (
                <span className="inline-flex items-center gap-1 text-sm text-fg-muted">
                  Video blocked ·{" "}
                  <Link
                    href="/moderation/blocked/remote"
                    className="focus-ring rounded-sm underline transition-colors hover:text-fg"
                  >
                    Manage
                  </Link>
                </span>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={blockState === "blocking"}
                  onClick={() => void blockRemoteVideo(report.remote_video_id as string)}
                >
                  {blockState === "blocking" ? "Blocking…" : "Block video"}
                </Button>
              )
            ) : null}
          </div>
          {blockError ? <p className="text-sm text-danger">{blockError}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

// ReportTarget shows the reported content: a link to the video for video reports,
// the quoted comment body for comment reports, the reported account for account
// reports, or the origin + title + local remote-watch link for remote_video
// reports (federated content).
function ReportTarget({ report }: { report: Report }) {
  if (report.target_type === "video" && report.video_id) {
    return (
      <p className="mt-2 text-sm">
        <Link
          href={`/videos/${report.video_id}`}
          className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2 transition-colors hover:text-fg-muted"
        >
          {report.video_title || "Untitled video"}
        </Link>
      </p>
    );
  }
  if (report.target_type === "remote_video") {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {report.remote_video_id ? (
          <Link
            href={`/remote/${report.remote_video_id}`}
            className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2 transition-colors hover:text-fg-muted"
          >
            {report.remote_video_title || "(remote video unavailable)"}
          </Link>
        ) : (
          <span className="font-semibold text-fg">
            {report.remote_video_title || "(remote video unavailable)"}
          </span>
        )}
        {report.remote_video_domain ? (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-fg-muted">
            <span className="sr-only">From </span>
            {report.remote_video_domain}
          </span>
        ) : null}
      </p>
    );
  }
  if (report.target_type === "comment") {
    return (
      <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-fg-muted italic">
        {report.comment_body || "(comment unavailable)"}
      </blockquote>
    );
  }
  if (report.target_type === "message") {
    // A reported direct message: the body is snapshotted at report time so it
    // survives a sender tombstone. The conversation stays private (no link) —
    // moderators act on the snapshot, resolve/reject, or report-purge (admin).
    return (
      <div className="mt-2">
        <blockquote className="border-l-2 border-border pl-3 text-sm text-fg-muted italic">
          {report.message_body || "(message unavailable)"}
        </blockquote>
        <p className="mt-1 text-xs text-fg-muted">Direct message</p>
      </div>
    );
  }
  if (report.target_type === "account") {
    return (
      <p className="mt-2 text-sm text-fg-muted">
        Reported account:{" "}
        <span className="font-semibold text-fg">
          {report.reported_username || "(account unavailable)"}
        </span>
      </p>
    );
  }
  return null;
}
