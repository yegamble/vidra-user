"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { useT } from "@/components/I18nProvider";
import { SLOT, withSlot } from "@/components/admin/messageSlot";
import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { ReportThread } from "@/components/reports/ReportThread";
import { RoleGate } from "@/components/RoleGate";
import { useSession } from "@/components/auth/AuthProvider";
import { ChevronLeftIcon, FlagIcon } from "@/components/icons";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipGroup } from "@/components/ui/FilterChips";
import { cn } from "@/lib/cn";
import { api, errorMessage } from "@/lib/api";
import type { Report, ReportReason, ReportStatus, ReportStatusFilter } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { PlainMessageKey, Translate } from "@/lib/i18n";
import { formatReportRange, reasonLabel, REPORT_REASONS } from "@/lib/report-reasons";
import { usePagedList } from "@/lib/use-paged-list";

const MAX_NOTE_LEN = 2000;
// The mail-triage two-pane opens at `lg`; below that a report drills in over the
// queue. Auto-selecting the first report only makes sense in the two-pane view.
const WIDE_QUERY = "(min-width: 1024px)";

function isWideViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches;
}

/**
 * The queue's real three-way status. It used to be Open / All, because the
 * endpoint's filter was a boolean pretending to be an enum — asking for
 * `resolved` returned the whole queue. Now that the backend rejects an
 * unrecognised value, "Resolved" is a question that can be asked.
 *
 * Filtering is the SERVER's job here, not a post-fetch `Array.filter`: the old
 * view narrowed the page it had been handed, so "Open" meant "the open ones
 * among the first hundred reports".
 */
const STATUS_OPTIONS: readonly { value: ReportStatusFilter; labelKey: PlainMessageKey }[] = [
  { value: "open", labelKey: "admin.queue.filter.open" },
  { value: "resolved", labelKey: "admin.queue.filter.resolved" },
  { value: "all", labelKey: "admin.queue.filter.all" },
];

const DEFAULT_STATUS: ReportStatusFilter = "open";

const EMPTY_COPY: Record<ReportStatusFilter, { title: PlainMessageKey; message: PlainMessageKey }> = {
  open: { title: "admin.queue.empty.open.title", message: "admin.queue.empty.open.message" },
  resolved: { title: "admin.queue.empty.resolved.title", message: "admin.queue.empty.resolved.message" },
  all: { title: "admin.queue.empty.all.title", message: "admin.queue.empty.all.message" },
};

// ModerationQueue is the moderator/admin abuse-report triage, styled as a Mail
// split view: a queue list (left) selects a report into a detail pane (right).
// Role-gated by RoleGate — an under-privileged/anonymous viewer sees the shared
// permission prompt and nothing fetches.
export function ModerationQueue() {
  return (
    <RoleGate minRole="moderator" action="review reports">
      <ListBoundary label="reports">
        <Queue />
      </ListBoundary>
    </RoleGate>
  );
}

function Queue() {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = usePagedList<Report>({
    filterKeys: ["status", "reason"],
    load: (query, signal) =>
      api
        .getReports(
          {
            status: (query.filters.status as ReportStatusFilter) ?? DEFAULT_STATUS,
            ...(query.filters.reason ? { reason: query.filters.reason as ReportReason } : {}),
            limit: query.limit,
            offset: query.offset,
          },
          signal,
        )
        .then((res) => ({
          items: res.reports,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  const status = (list.filters.status as ReportStatusFilter) ?? DEFAULT_STATUS;
  const reasonFilter = list.filters.reason ?? "";
  const { items, patch, drop } = list;

  // The selection is DERIVED, not synchronised: whatever the moderator picked,
  // falling back to the first report on the two-pane layout so the detail pane
  // is never blank. That makes a filter switch or a page turn self-correcting —
  // the old id simply is not in `items` any more — with no effect to keep in
  // step. Narrow viewports get no fallback: they stay on the queue until tapped.
  const selected = useMemo(
    () =>
      items.find((r) => r.id === selectedId) ??
      (isWideViewport() ? (items[0] ?? null) : null),
    [items, selectedId],
  );

  // Now that the SERVER applies the status filter, `total` counts the reports
  // matching it. Under "Open", a report that has just been accepted or rejected
  // is no longer one of them, so it leaves the page and the count together —
  // `patch` would leave the pager promising an open report that is not. Under
  // "All" the row stays, wearing its new status.
  //
  // Nothing needs to move the selection: `selected` is derived, so a report that
  // is no longer in `items` falls through to the next one on the two-pane view.
  const onResolved = useCallback(
    (id: string, newStatus: ReportStatus) => {
      if (status === "all") {
        patch((reports) => reports.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
      } else {
        drop((r) => r.id !== id);
      }
    },
    [drop, patch, status],
  );

  // An admin hard-delete really destroys the row, so it comes off the total too.
  const onDeleted = useCallback((id: string) => drop((r) => r.id !== id), [drop]);

  return (
    <PagedListShell
      list={list}
      noun="report"
      toolbar={
        <div className="flex flex-wrap items-center gap-3">
          <FilterChipGroup<ReportStatusFilter>
            label={t("admin.queue.filterLabel")}
            options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
            value={status}
            onChange={(next) => list.setFilter("status", next === DEFAULT_STATUS ? "" : next)}
          />
          <Select
            aria-label={t("admin.queue.categoryLabel")}
            value={reasonFilter}
            onChange={(e) => list.setFilter("reason", e.target.value)}
          >
            <option value="">{t("admin.queue.allCategories")}</option>
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      }
      errorMessage={t("admin.queue.loadError")}
      emptyIcon={<FlagIcon size={24} />}
      emptyTitle={t(EMPTY_COPY[status].title)}
      emptyMessage={t(EMPTY_COPY[status].message)}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-start">
        {/* Queue list — hidden on narrow viewports once a report is open. */}
        <ul
          aria-label={t("admin.queue.listLabel")}
          className={cn("flex-col gap-1.5", selected ? "hidden lg:flex" : "flex")}
        >
          {items.map((report) => (
            <li key={report.id}>
              <ReportRow
                report={report}
                active={report.id === selected?.id}
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
                title={t("admin.queue.noneSelected.title")}
                message={t("admin.queue.noneSelected.message")}
              />
            </div>
          )}
        </div>
      </div>
    </PagedListShell>
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

// "remote_video" reads as "remote video"; used for the detail type pill. A
// target type this build does not know falls back to the raw wire value.
function typeLabel(report: Report, t: Translate): string {
  switch (report.target_type) {
    case "video":
      return t("admin.queue.type.video");
    case "remote_video":
      return t("admin.queue.type.remoteVideo");
    case "comment":
      return t("admin.queue.type.comment");
    case "message":
      return t("admin.queue.type.message");
    case "account":
      return t("admin.queue.type.account");
    default:
      return String(report.target_type).replace("_", " ");
  }
}

const STATUS_LABEL: Record<ReportStatus, PlainMessageKey> = {
  open: "admin.queue.status.open",
  accepted: "admin.queue.status.accepted",
  rejected: "admin.queue.status.rejected",
};

// A short subject line for the queue row (never the reported body itself — that
// lives in the detail pane).
function reportSubject(report: Report, t: Translate): string {
  switch (report.target_type) {
    case "video":
      return report.video_title || t("admin.queue.untitledVideo");
    case "remote_video":
      return report.remote_video_title || t("admin.queue.remoteVideoReport");
    case "comment":
      return t("admin.queue.commentReport");
    case "message":
      return t("admin.queue.messageReport");
    case "account":
      return report.reported_username || t("admin.queue.accountReport");
    default:
      return t("admin.queue.report");
  }
}

// A deterministic accessible name for the queue row (also announces the status,
// which the colored dot conveys visually).
function reportRowLabel(report: Report, t: Translate): string {
  const type = typeLabel(report, t);
  const capitalized = type.charAt(0).toUpperCase() + type.slice(1);
  return t("admin.queue.rowAria", {
    type: capitalized,
    user: report.reporter.username,
    status: t(STATUS_LABEL[report.status]),
  });
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
  const t = useT();
  return (
    <button
      type="button"
      aria-label={reportRowLabel(report, t)}
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
          {reportSubject(report, t)}
        </span>
      </span>
      <span className="truncate text-footnote text-fg-muted">
        {report.reporter.username} · {relativeTime(report.created_at)}
      </span>
      <span className="truncate text-footnote text-fg-muted">{report.reason}</span>
      <ReasonChips report={report} />
    </button>
  );
}

// The reporter's predefined categories (core 0170), as quiet chips. Renders
// nothing for the common case of a report with none.
// Spans only (no list): the row renders these inside a <button>, where block
// and list content is invalid HTML. The labels read as one sentence to AT.
function ReasonChips({ report }: { report: Report }) {
  const t = useT();
  // `?? []`: an older core (or a mocked fixture) omits the field entirely.
  const reasons = report.reasons ?? [];
  if (reasons.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      <span className="sr-only">{t("admin.queue.categories")}</span>
      {reasons.map((r) => (
        <Badge key={r} variant="strong">
          {reasonLabel(r)}
        </Badge>
      ))}
    </span>
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
  const t = useT();
  const { user } = useSession();
  const [note, setNote] = useState("");
  const [rowState, setRowState] = useState<RowState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [blockState, setBlockState] = useState<"idle" | "composing" | "blocking" | "blocked">(
    "idle",
  );
  const [blockReason, setBlockReason] = useState("");
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
      setError(errorMessage(err, t("admin.queue.resolveError")));
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
      setDeleteError(errorMessage(err, t("admin.queue.deleteError")));
      setDeleteState("idle");
    }
  }

  // Block the reported video with a reason the MODERATOR wrote. It used to send
  // the reporter's own words, which was harmless while block reasons were
  // staff-only and is not now that the creator reads them (the A16 ruling).
  // Independent of resolution — a moderator may block without resolving.
  async function blockVideo(videoId: string) {
    if (blockState === "blocking") return;
    setBlockState("blocking");
    setBlockError(null);
    try {
      await api.blockVideo(videoId, { reason: blockReason.trim() });
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
      aria-label={t("admin.queue.detailLabel")}
      className="overflow-hidden rounded-2xl bg-surface shadow-soft"
    >
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <button
          type="button"
          onClick={onBack}
          className="focus-ring -ml-1 inline-flex items-center gap-1 self-start rounded-lg py-1 pr-2 text-footnote font-semibold text-accent-text transition-colors hover:bg-surface-muted lg:hidden"
        >
          <ChevronLeftIcon size={16} aria-hidden />
          {t("admin.queue.back")}
        </button>

        <div className="flex flex-wrap items-center gap-2 text-footnote text-fg-muted">
          <Badge variant={STATUS_BADGE[report.status]} status>
            {t(STATUS_LABEL[report.status])}
          </Badge>
          <Badge variant="strong" status>
            {typeLabel(report, t)}
          </Badge>
          <span>
            {withSlot(
              t("admin.queue.reportedBy", { name: SLOT }),
              <span className="font-medium text-fg">{report.reporter.username}</span>,
            )}
          </span>
          <span aria-hidden>·</span>
          <span>{relativeTime(report.created_at)}</span>
        </div>

        <ReportTarget report={report} />

        <ReasonChips report={report} />
        {report.start_seconds !== undefined && report.video_id ? (
          <p className="text-sm text-fg-muted">
            <span className="font-semibold text-fg">{t("admin.queue.at")}</span>{" "}
            <Link
              href={`/videos/${report.video_id}?t=${report.start_seconds}`}
              className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2 transition-colors hover:text-fg-muted"
            >
              {formatReportRange(report.start_seconds, report.end_seconds)}
            </Link>
          </p>
        ) : null}

        <p className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">{t("admin.queue.reason")}</span> {report.reason}
        </p>

        {!isOpen && report.moderator_note ? (
          <p className="text-footnote text-fg-muted">
            <span className="font-semibold text-fg">{t("admin.reg.note")}</span> {report.moderator_note}
          </p>
        ) : null}

        {isOpen ? (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-fg-muted">{t("admin.queue.noteLabel")}</span>
            <textarea
              aria-label={t("admin.queue.noteAria")}
              rows={2}
              maxLength={MAX_NOTE_LEN}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
            />
          </label>
        ) : null}

        {/* The block reason, written HERE rather than copied from the report.
            Until the A16 ruling this field sent the REPORTER's words to the
            server, which was harmless while block reasons were staff-only —
            they are now shown to the creator, and a reporter's prose about the
            person they reported is the last thing that should reach them.
            Empty is allowed: the creator then reads the neutral take-down
            notice, exactly as before this field existed. */}
        {blockState === "composing" ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-fg">
              {t("admin.queue.blockWhy")}
            </span>
            <span className="mb-1.5 block text-xs text-fg-muted">
              {t("admin.queue.blockHint")}
            </span>
            <textarea
              aria-label={t("admin.queue.blockReasonAria")}
              rows={2}
              maxLength={MAX_NOTE_LEN}
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
            />
          </label>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {blockError ? <p className="text-sm text-danger">{blockError}</p> : null}
        {deleteError ? <p className="text-sm text-danger">{deleteError}</p> : null}

        {/* The conversation with the reporter (core 0163); keyed so a draft
            never carries over to the next report. */}
        <div className="border-t border-border-subtle pt-3">
          <ReportThread key={report.id} reportId={report.id} viewer="staff" />
        </div>
      </div>

      {/* Action bar — sticky to the viewport bottom while the report scrolls. */}
      {isOpen ? (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border-subtle bg-surface/85 px-4 py-3 backdrop-blur sm:px-5">
          <Button
            size="sm"
            disabled={rowState === "submitting"}
            onClick={() => void resolve("accepted")}
          >
            {t("admin.queue.accept")}
          </Button>
          <Button
            variant="tonal"
            size="sm"
            disabled={rowState === "submitting"}
            onClick={() => void resolve("rejected")}
          >
            {t("admin.action.reject")}
          </Button>
          {report.target_type === "video" && report.video_id ? (
            blockState === "blocked" ? (
              <BlockedNote manageHref="/moderation/blocked" />
            ) : blockState === "idle" ? (
              <Button variant="danger" size="sm" onClick={() => setBlockState("composing")}>
                {t("admin.queue.blockVideo")}
              </Button>
            ) : (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={blockState === "blocking"}
                  onClick={() => void blockVideo(report.video_id as string)}
                >
                  {blockState === "blocking" ? t("admin.action.blocking") : t("admin.queue.confirmBlock")}
                </Button>
                <Button
                  variant="tonal"
                  size="sm"
                  disabled={blockState === "blocking"}
                  onClick={() => setBlockState("idle")}
                >
                  {t("common.cancel")}
                </Button>
              </>
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
                {blockState === "blocking" ? t("admin.action.blocking") : t("admin.queue.blockVideo")}
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
              aria-label={t("admin.queue.deleteAria", { type: typeLabel(report, t) })}
              onClick={() => setDeleteState("confirm")}
              className="self-start"
            >
              {t("admin.queue.delete")}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-fg-muted">
                {t("admin.queue.deleteConfirm")}
              </span>
              <button
                type="button"
                disabled={deleteState === "deleting"}
                onClick={() => void hardDelete()}
                className="focus-ring rounded-full font-semibold text-danger transition-colors hover:text-danger/80 disabled:opacity-60"
              >
                {deleteState === "deleting" ? t("admin.queue.deleting") : t("admin.queue.confirm")}
              </button>
              <button
                type="button"
                disabled={deleteState === "deleting"}
                onClick={() => setDeleteState("idle")}
                className="focus-ring rounded-full font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
              >
                {t("common.cancel")}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function BlockedNote({ manageHref }: { manageHref: string }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 text-sm text-fg-muted">
      {t("admin.queue.blocked")}{" "}
      <Link
        href={manageHref}
        className="focus-ring rounded-sm underline transition-colors hover:text-fg"
      >
        {t("admin.queue.manage")}
      </Link>
    </span>
  );
}

// ReportTarget shows the reported content: a link to the video for video reports,
// the quoted comment body for comment reports, the reported account for account
// reports, or the origin + title + local remote-watch link for remote_video
// reports (federated content).
function ReportTarget({ report }: { report: Report }) {
  const t = useT();
  if (report.target_type === "video" && report.video_id) {
    return (
      <p className="text-sm">
        <Link
          href={`/videos/${report.video_id}`}
          className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2 transition-colors hover:text-fg-muted"
        >
          {report.video_title || t("admin.queue.untitledVideo")}
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
            {report.remote_video_title || t("admin.queue.remoteUnavailable")}
          </Link>
        ) : (
          <span className="font-semibold text-fg">
            {report.remote_video_title || t("admin.queue.remoteUnavailable")}
          </span>
        )}
        {report.remote_video_domain ? (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-fg-muted">
            <span className="sr-only">{t("admin.queue.from")}</span>
            {report.remote_video_domain}
          </span>
        ) : null}
      </p>
    );
  }
  if (report.target_type === "comment") {
    return (
      <blockquote className="border-l-2 border-border pl-3 text-sm text-fg-muted italic">
        {report.comment_body || t("admin.queue.commentUnavailable")}
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
          {report.message_body || t("admin.queue.messageUnavailable")}
        </blockquote>
        <p className="mt-1 text-xs text-fg-muted">{t("admin.queue.directMessage")}</p>
      </div>
    );
  }
  if (report.target_type === "account") {
    return (
      <p className="text-sm text-fg-muted">
        {t("admin.queue.reportedAccount")}{" "}
        <span className="font-semibold text-fg">
          {report.reported_username || t("admin.queue.accountUnavailable")}
        </span>
      </p>
    );
  }
  return null;
}
