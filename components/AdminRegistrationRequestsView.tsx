"use client";

import { useCallback, useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { useSession } from "@/components/auth/AuthProvider";
import { UsersIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { FilterChipGroup, type FilterChipOption } from "@/components/ui/FilterChips";
import { ApiError, api, errorMessage } from "@/lib/api";
import type {
  RegistrationRequest,
  RegistrationRequestFilter,
  RegistrationRequestStatus,
} from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

const MAX_NOTE_LEN = 2000;

/**
 * The full lifecycle, now that the endpoint has a real enum. It used to be a
 * boolean in disguise — "send pending, or send nothing" — so anything other
 * than `pending` fell through to "everything", and the rejected pile was
 * unaskable.
 */
const STATUS_OPTIONS: readonly FilterChipOption<RegistrationRequestFilter>[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const DEFAULT_STATUS: RegistrationRequestFilter = "pending";

const EMPTY_COPY: Record<RegistrationRequestFilter, { title: string; message: string }> = {
  pending: {
    title: "No pending requests",
    message: "Nothing to review right now. Signups awaiting approval will appear here.",
  },
  approved: {
    title: "No approved requests",
    message: "Requests you approve are kept here as a record.",
  },
  rejected: {
    title: "No rejected requests",
    message: "Requests you reject are kept here as a record.",
  },
  all: {
    title: "No registration requests yet",
    message: "When this instance requires signup approval, requests show up here.",
  },
};

// AdminRegistrationRequestsView is the admin-only registration approval queue,
// role-gated by RoleGate (an under-privileged/anonymous viewer sees the shared
// permission prompt and nothing fetches). Admins review pending signups and
// approve or reject them.
export function AdminRegistrationRequestsView() {
  const { user } = useSession();

  return (
    <RoleGate minRole="admin" action="review registration requests">
      {user ? (
        <ListBoundary label="registration requests">
          <RequestQueue reviewerUsername={user.username} />
        </ListBoundary>
      ) : null}
    </RoleGate>
  );
}

function RequestQueue({ reviewerUsername }: { reviewerUsername: string }) {
  const list = usePagedList<RegistrationRequest>({
    filterKeys: ["status"],
    load: (query, signal) =>
      api
        .getRegistrationRequests(
          {
            status: (query.filters.status as RegistrationRequestFilter) ?? DEFAULT_STATUS,
            limit: query.limit,
            offset: query.offset,
          },
          signal,
        )
        .then((res) => ({
          items: res.requests,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  const status = (list.filters.status as RegistrationRequestFilter) ?? DEFAULT_STATUS;
  const { patch, drop } = list;

  // The SERVER applies the status filter, so `total` counts the requests that
  // match it. A request that has just been approved or rejected still matches
  // "All", where the row simply flips to its new status (with the acting admin
  // as reviewer) so the outcome is visible without a refetch. Under "Pending" it
  // does not match any more, so it leaves the page and the count together.
  const onResolved = useCallback(
    (id: string, newStatus: RegistrationRequestStatus, moderatorNote?: string) => {
      if (status !== "all" && status !== newStatus) {
        drop((r) => r.id !== id);
        return;
      }
      patch((requests) =>
        requests.map((r) =>
          r.id === id
            ? {
                ...r,
                status: newStatus,
                moderator_note: moderatorNote,
                reviewed_at: new Date().toISOString(),
                reviewer_username: reviewerUsername,
              }
            : r,
        ),
      );
    },
    [drop, patch, reviewerUsername, status],
  );

  return (
    <PagedListShell
      list={list}
      noun="registration request"
      toolbar={
        <FilterChipGroup<RegistrationRequestFilter>
          label="Filter registration requests"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(next) =>
            list.setFilter("status", next === DEFAULT_STATUS ? "" : next)
          }
        />
      }
      errorMessage="Could not load registration requests."
      emptyIcon={<UsersIcon size={24} />}
      emptyTitle={EMPTY_COPY[status].title}
      emptyMessage={EMPTY_COPY[status].message}
    >
      <ul className="flex flex-col gap-3">
        {list.items.map((request) => (
          <li key={request.id}>
            <RequestRow request={request} onResolved={onResolved} />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

const STATUS_STYLE: Record<RegistrationRequestStatus, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-surface-strong text-fg-muted",
};

type RowState = "idle" | "submitting";

function RequestRow({
  request,
  onResolved,
}: {
  request: RegistrationRequest;
  onResolved: (id: string, status: RegistrationRequestStatus, moderatorNote?: string) => void;
}) {
  const [note, setNote] = useState("");
  const [rowState, setRowState] = useState<RowState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    if (rowState === "submitting") return;
    setRowState("submitting");
    setError(null);
    try {
      await api.approveRegistrationRequest(request.id);
      onResolved(request.id, "approved");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The username/email was taken between filing and approval.
        setError("That username or email has since been taken, so this request cannot be approved.");
      } else {
        setError(errorMessage(err, "Could not approve this request."));
      }
      setRowState("idle");
    }
  }

  async function reject() {
    if (rowState === "submitting") return;
    setRowState("submitting");
    setError(null);
    const trimmed = note.trim();
    try {
      await api.rejectRegistrationRequest(request.id, trimmed ? { note: trimmed } : {});
      onResolved(request.id, "rejected", trimmed || undefined);
    } catch (err) {
      setError(errorMessage(err, "Could not reject this request."));
      setRowState("idle");
    }
  }

  return (
    <article className="rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-semibold tracking-tight text-fg">{request.username}</span>
        <span className="text-[13px] text-fg-muted">{request.email}</span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-[0.04em] uppercase ${STATUS_STYLE[request.status]}`}
        >
          {request.status}
        </span>
        <span className="text-[13px] text-fg-muted">
          requested {relativeTime(request.created_at)}
        </span>
      </div>

      {request.note ? (
        <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-fg-muted italic">
          {request.note}
        </blockquote>
      ) : null}

      {request.status !== "pending" ? (
        <p className="mt-2 text-xs text-fg-muted">
          {request.status === "approved" ? "Approved" : "Rejected"}
          {request.reviewer_username ? (
            <>
              {" "}
              by <span className="font-medium">{request.reviewer_username}</span>
            </>
          ) : null}
          {request.reviewed_at ? <> {relativeTime(request.reviewed_at)}</> : null}
          {request.moderator_note ? (
            <>
              {" "}
              · <span className="font-medium">Note:</span> {request.moderator_note}
            </>
          ) : null}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-fg-muted">
              Internal note (optional, recorded on reject)
            </span>
            <textarea
              aria-label={`Internal note for ${request.username}`}
              rows={2}
              maxLength={MAX_NOTE_LEN}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              aria-label={`Approve ${request.username}`}
              disabled={rowState === "submitting"}
              onClick={() => void approve()}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Reject ${request.username}`}
              disabled={rowState === "submitting"}
              onClick={() => void reject()}
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
