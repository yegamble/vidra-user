"use client";

import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { RegistrationRequest, RegistrationRequestStatus } from "@/lib/api";
import { relativeTime } from "@/lib/format";

const MAX_NOTE_LEN = 2000;

type Status = "loading" | "error" | "ready";

// AdminRegistrationRequestsView is the admin-only registration approval queue,
// role-gated by RoleGate (an under-privileged/anonymous viewer sees the shared
// permission prompt and nothing fetches). Admins review pending signups and
// approve or reject them.
export function AdminRegistrationRequestsView() {
  const { user } = useSession();

  return (
    <RoleGate minRole="admin" action="review registration requests">
      {user ? <RequestQueue reviewerUsername={user.username} /> : null}
    </RoleGate>
  );
}

function RequestQueue({ reviewerUsername }: { reviewerUsername: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getRegistrationRequests(
        { status: pendingOnly ? "pending" : undefined, limit: 100 },
        controller.signal,
      )
      .then((res) => {
        setRequests(res.requests);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [pendingOnly, reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  // Switch filter (re-triggers the fetch effect). Set loading here rather than in
  // the effect body so a stale list doesn't flash before the refetch resolves.
  const selectFilter = useCallback(
    (next: boolean) => {
      if (next === pendingOnly) return;
      setStatus("loading");
      setPendingOnly(next);
    },
    [pendingOnly],
  );

  // Reflect a resolution in place: the row flips to its new status (with the
  // acting admin as reviewer) so the outcome is visible without a refetch; the
  // next fetch (filter switch / reload) confirms persistence.
  const onResolved = useCallback(
    (id: string, newStatus: RegistrationRequestStatus, moderatorNote?: string) => {
      setRequests((prev) =>
        prev.map((r) =>
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
    [reviewerUsername],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2" role="group" aria-label="Filter registration requests">
        <FilterButton active={pendingOnly} onClick={() => selectFilter(true)}>
          Pending
        </FilterButton>
        <FilterButton active={!pendingOnly} onClick={() => selectFilter(false)}>
          All
        </FilterButton>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-24">
          <Spinner label="Loading registration requests" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load registration requests." onRetry={retry} />
      ) : requests.length === 0 ? (
        <EmptyState
          title={pendingOnly ? "No pending requests" : "No registration requests yet"}
          message={
            pendingOnly
              ? "Nothing to review right now. Signups awaiting approval will appear here."
              : "When this instance requires signup approval, requests show up here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <li key={request.id}>
              <RequestRow request={request} onResolved={onResolved} />
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
          ? "focus-ring rounded-full border border-accent bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-accent-fg"
          : "focus-ring rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted"
      }
    >
      {children}
    </button>
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
    <article className="rounded-2xl border border-border-subtle bg-surface p-4">
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
