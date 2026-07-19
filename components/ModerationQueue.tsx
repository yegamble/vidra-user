"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { useSession } from "@/components/auth/AuthProvider";
import { ChevronLeftIcon, FlagIcon } from "@/components/icons";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { api, errorMessage } from "@/lib/api";
import type { Report, ReportStatus } from "@/lib/api";
import { relativeTime } from "@/lib/format";

const MAX_NOTE_LEN = 2000;
// The mail-triage two-pane opens at `lg`; below that a report drills in over the
// queue. Auto-selecting the first report only makes sense in the two-pane view.
const WIDE_QUERY = "(min-width: 1024px)";

function isWideViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches;
}

type Status = "loading" | "error" | "ready";

// ModerationQueue is the moderator/admin abuse-report triage, styled as a Mail
// split view: a queue list (left) selects a report into a detail pane (right).
// Role-gated by RoleGate — an under-privileged/anonymous viewer sees the shared
// permission prompt and nothing fetches.
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getReports({ openOnly, limit: 100 }, controller.signal)
      .then((res) => {
        setReports(res.reports);
        setStatus("ready");
        // Keep a report selected on the two-pane view so the detail pane is
        // never blank (initial load / filter switch); narrow viewports stay on
        // the queue until the moderator taps in.
        const vis = openOnly ? res.reports.filter((r) => r.status === "open") : res.reports;
        setSelectedId((cur) =>
          cur && vis.some((r) => r.id === cur)
            ? cur
            : isWideViewport()
              ? (vis[0]?.id ?? null)
              : null,
        );
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

  const visible = useMemo(
    () => (openOnly ? reports.filter((r) => r.status === "open") : reports),
    [openOnly, reports],
  );
  const selected = useMemo(
    () => visible.find((r) => r.id === selectedId) ?? null,
    [visible, selectedId],
  );

  // After a resolve, update the row's status locally so it drops out of the
  // open-only view immediately; a later refetch confirms persistence. In the
  // open-only view the resolved report leaves the queue, so advance the detail
  // pane to the next open report (two-pane view only).
  const onResolved = useCallback(
    (id: string, newStatus: ReportStatus) => {
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
      if (!openOnly) return;
      setSelectedId((cur) => {
        if (cur !== id) return cur;
        const next = reports.find((r) => r.status === "open" && r.id !== id);
        return isWideViewport() ? (next?.id ?? null) : null;
      });
    },
    [openOnly, reports],
  );

  // After an admin hard-delete the row is gone for good — drop it locally and
  // advance the detail pane to the next visible report; a later refetch confirms
  // the purge persisted.
  const onDeleted = useCallback(
    (id: string) => {
      setReports((prev) => prev.filter((r) => r.id !== id));
      setSelectedId((cur) => {
        if (cur !== id) return cur;
        const pool = openOnly ? reports.filter((r) => r.status === "open") : reports;
        const next = pool.find((r) => r.id !== id);
        return isWideViewport() ? (next?.id ?? null) : null;
      });
    },
    [openOnly, reports],
  );

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
          icon={<FlagIcon size={24} />}
          title={openOnly ? "No open reports" : "No reports yet"}
          message={
            openOnly
              ? "Nothing to review right now. Reports filed by viewers will appear here."
              : "When viewers report a video or comment, it shows up here."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-start">
          {/* Queue list — hidden on narrow viewports once a report is open. */}
          <ul
            aria-label="Report queue"
            className={cn("flex-col gap-1.5", selected ? "hidden lg:flex" : "flex")}
          >
            {visible.map((report) => (
              <li key={report.id}>
                <ReportRow
                  report={report}
                  active={report.id === selectedId}
                  onSelect={() => setSelectedId(report.id)}
                />
              </li>
            ))}
          </ul>

          {/* Detail pane — the report drills in here on narrow viewports. */}
          <div className={cn(selected ? "block" : "hidden lg:block")}>
            {selected ? (
              <ReportDetail
                key={selected.id}
                report={selected}
                onBack={() => setSelectedId(null)}
                onResolved={onResolved}
                onDeleted={onDeleted}
              />
            ) : (
              <div className="hidden rounded-2xl bg-surface-muted lg:block">
                <EmptyState
                  icon={<FlagIcon size={24} />}
                  title="No report selected"
                  message="Choose a report from the queue to review it."
                />
              </div>
            )}
          </div>
        </div>
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

// Status pills: OPEN warning-tinted, accepted success-tinted, rejected neutral.
const STATUS_BADGE: Record<ReportStatus, BadgeVariant> = {
  open: "warning",
  accepted: "success",
  rejected: "strong",
};
// Queue-row status dot (Apple system fills). Decorative — the row's accessible
// name carries the status in words.
const STATUS_DOT: Record<ReportStatus, string> = {
  open: "bg-warning-solid",
  accepted: "bg-success-solid",
  rejected: "bg-fg-subtle",
};

// "remote_video" reads as "remote video"; used for the detail type pill.
function typeLabel(report: Report): string {
  return report.target_type.replace("_", " ");
}

// A short subject line for the queue row (never the reported body itself — that
// lives in the detail pane).
function reportSubject(report: Report): string {
  switch (report.target_type) {
    case "video":
      return report.video_title || "Untitled video";
    case "remote_video":
      return report.remote_video_title || "Remote video report";
    case "comment":
      return "Comment report";
    case "message":
      return "Message report";
    case "account":
      return report.reported_username || "Account report";
    default:
      return "Report";
  }
}

// A deterministic accessible name for the queue row (also announces the status,
// which the colored dot conveys visually).
function reportRowLabel(report: Report): string {
  const type = typeLabel(report);
  const capitalized = type.charAt(0).toUpperCase() + type.slice(1);
  return `${capitalized} report by ${report.reporter.username}, ${report.status}`;
}

function ReportRow({
  report,
  active,
  onSelect,
}: {
  report: Report;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={reportRowLabel(report)}
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "focus-ring flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors",
        active ? "bg-accent/12" : "hover:bg-surface-muted",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[report.status])}
        />
        <span
          className={cn(
            "truncate text-subhead font-semibold",
            active ? "text-accent-text" : "text-fg",
          )}
        >
          {reportSubject(report)}
        </span>
      </span>
      <span className="truncate text-footnote text-fg-muted">
        {report.reporter.username} · {relativeTime(report.created_at)}
      </span>
      <span className="truncate text-footnote text-fg-muted">{report.reason}</span>
    </button>
  );
}

type RowState = "idle" | "submitting";

function ReportDetail({
  report,
  onBack,
  onResolved,
  onDeleted,
}: {
  report: Report;
  onBack: () => void;
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

  const isOpen = report.status === "open";

  return (
    <section
      aria-label="Report detail"
      className="overflow-hidden rounded-2xl bg-surface shadow-soft"
    >
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <button
          type="button"
          onClick={onBack}
          className="focus-ring -ml-1 inline-flex items-center gap-1 self-start rounded-lg py-1 pr-2 text-footnote font-semibold text-accent-text transition-colors hover:bg-surface-muted lg:hidden"
        >
          <ChevronLeftIcon size={16} aria-hidden />
          Queue
        </button>

        <div className="flex flex-wrap items-center gap-2 text-footnote text-fg-muted">
          <Badge variant={STATUS_BADGE[report.status]} status>
            {report.status}
          </Badge>
          <Badge variant="strong" status>
            {typeLabel(report)}
          </Badge>
          <span>
            Reported by <span className="font-medium text-fg">{report.reporter.username}</span>
          </span>
          <span aria-hidden>·</span>
          <span>{relativeTime(report.created_at)}</span>
        </div>

        <ReportTarget report={report} />

        <p className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">Reason:</span> {report.reason}
        </p>

        {!isOpen && report.moderator_note ? (
          <p className="text-footnote text-fg-muted">
            <span className="font-semibold text-fg">Note:</span> {report.moderator_note}
          </p>
        ) : null}

        {isOpen ? (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-fg-muted">Internal note (optional)</span>
            <textarea
              aria-label="Internal moderator note"
              rows={2}
              maxLength={MAX_NOTE_LEN}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
            />
          </label>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {blockError ? <p className="text-sm text-danger">{blockError}</p> : null}
        {deleteError ? <p className="text-sm text-danger">{deleteError}</p> : null}
      </div>

      {/* Action bar — sticky to the viewport bottom while the report scrolls. */}
      {isOpen ? (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border-subtle bg-surface/85 px-4 py-3 backdrop-blur sm:px-5">
          <Button
            size="sm"
            disabled={rowState === "submitting"}
            onClick={() => void resolve("accepted")}
          >
            Accept
          </Button>
          <Button
            variant="tonal"
            size="sm"
            disabled={rowState === "submitting"}
            onClick={() => void resolve("rejected")}
          >
            Reject
          </Button>
          {report.target_type === "video" && report.video_id ? (
            blockState === "blocked" ? (
              <BlockedNote manageHref="/moderation/blocked" />
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
              <BlockedNote manageHref="/moderation/blocked/remote" />
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
      ) : user?.role === "admin" ? (
        // Hard-delete is an admin-only purge of a RESOLVED report (moderators
        // resolve but cannot delete; open reports must be resolved first).
        <div className="sticky bottom-0 flex flex-col gap-1 border-t border-border-subtle bg-surface/85 px-4 py-3 backdrop-blur sm:px-5">
          {deleteState === "idle" ? (
            <Button
              variant="danger-outline"
              size="sm"
              aria-label={`Delete this ${typeLabel(report)} report`}
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
        </div>
      ) : null}
    </section>
  );
}

function BlockedNote({ manageHref }: { manageHref: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-fg-muted">
      Video blocked ·{" "}
      <Link
        href={manageHref}
        className="focus-ring rounded-sm underline transition-colors hover:text-fg"
      >
        Manage
      </Link>
    </span>
  );
}

// ReportTarget shows the reported content: a link to the video for video reports,
// the quoted comment body for comment reports, the reported account for account
// reports, or the origin + title + local remote-watch link for remote_video
// reports (federated content).
function ReportTarget({ report }: { report: Report }) {
  if (report.target_type === "video" && report.video_id) {
    return (
      <p className="text-sm">
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
      <p className="flex flex-wrap items-center gap-2 text-sm">
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
      <blockquote className="border-l-2 border-border pl-3 text-sm text-fg-muted italic">
        {report.comment_body || "(comment unavailable)"}
      </blockquote>
    );
  }
  if (report.target_type === "message") {
    // A reported direct message: the body is snapshotted at report time so it
    // survives a sender tombstone. The conversation stays private (no link) —
    // moderators act on the snapshot, resolve/reject, or report-purge (admin).
    return (
      <div>
        <blockquote className="border-l-2 border-border pl-3 text-sm text-fg-muted italic">
          {report.message_body || "(message unavailable)"}
        </blockquote>
        <p className="mt-1 text-xs text-fg-muted">Direct message</p>
      </div>
    );
  }
  if (report.target_type === "account") {
    return (
      <p className="text-sm text-fg-muted">
        Reported account:{" "}
        <span className="font-semibold text-fg">
          {report.reported_username || "(account unavailable)"}
        </span>
      </p>
    );
  }
  return null;
}
