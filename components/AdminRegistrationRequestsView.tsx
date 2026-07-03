"use client";

import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
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
          ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      }
    >
      {children}
    </button>
  );
}

const STATUS_STYLE: Record<RegistrationRequestStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  rejected: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
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
        setError(err instanceof ApiError ? err.message : "Could not approve this request.");
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
      setError(err instanceof ApiError ? err.message : "Could not reject this request.");
      setRowState("idle");
    }
  }

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{request.username}</span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{request.email}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[request.status]}`}
        >
          {request.status}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          requested {relativeTime(request.created_at)}
        </span>
      </div>

      {request.note ? (
        <blockquote className="mt-2 border-l-2 border-zinc-300 pl-3 text-sm text-zinc-700 italic dark:border-zinc-700 dark:text-zinc-300">
          {request.note}
        </blockquote>
      ) : null}

      {request.status !== "pending" ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
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
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              Internal note (optional, recorded on reject)
            </span>
            <textarea
              aria-label={`Internal note for ${request.username}`}
              rows={2}
              maxLength={MAX_NOTE_LEN}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={`Approve ${request.username}`}
              disabled={rowState === "submitting"}
              onClick={() => void approve()}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              aria-label={`Reject ${request.username}`}
              disabled={rowState === "submitting"}
              onClick={() => void reject()}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
