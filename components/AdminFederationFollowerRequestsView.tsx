"use client";

import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { FederationFollowerRequest } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// AdminFederationFollowerRequestsView is the admin-only federation
// follower-approval queue (config-parity W12; modeled on the
// registration-requests queue). While federation_follower_approval is on,
// inbound ActivityPub channel Follows are held pending here: approving queues
// the Accept the remote has been waiting on, rejecting removes the pending
// follow and queues a Reject. A vidra deviation recorded in the parity ledger:
// approval applies to CHANNEL followers, since vidra has no instance-level AP
// actor. ActivityPub only — ATProto has no inbound path.
export function AdminFederationFollowerRequestsView() {
  return (
    <RoleGate minRole="admin" action="review follower requests">
      <RequestQueue />
    </RoleGate>
  );
}

function RequestQueue() {
  const [status, setStatus] = useState<Status>("loading");
  const [requests, setRequests] = useState<FederationFollowerRequest[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getFederationFollowerRequests({ limit: 100 }, controller.signal)
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
  }, [reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  // A resolved request simply leaves the pending list (the queue only ever
  // holds unresolved follows — there is no resolved-state history to show).
  const onResolved = useCallback((id: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {status === "loading" ? (
        <div className="flex justify-center py-24">
          <Spinner label="Loading follower requests" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load follower requests." onRetry={retry} />
      ) : requests.length === 0 ? (
        <EmptyState
          title="No pending follower requests"
          message="Nothing to review right now. While follower approval is on, new remote followers of local channels appear here."
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

type RowState =
  | { kind: "idle" }
  | { kind: "confirming"; action: "approve" | "reject" }
  | { kind: "submitting" };

/** The follower's display identity: cached handle when known, actor URL otherwise. */
function followerIdentity(request: FederationFollowerRequest): string {
  return request.handle ?? request.actor_url;
}

function RequestRow({
  request,
  onResolved,
}: {
  request: FederationFollowerRequest;
  onResolved: (id: string) => void;
}) {
  const [rowState, setRowState] = useState<RowState>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  const identity = followerIdentity(request);

  async function resolve(action: "approve" | "reject") {
    setRowState({ kind: "submitting" });
    setError(null);
    try {
      if (action === "approve") {
        await api.approveFederationFollowerRequest(request.id);
      } else {
        await api.rejectFederationFollowerRequest(request.id);
      }
      onResolved(request.id);
    } catch (err) {
      setError(
        errorMessage(
          err,
          action === "approve"
            ? "Could not approve this follower."
            : "Could not reject this follower.",
        ),
      );
      setRowState({ kind: "idle" });
    }
  }

  const confirming = rowState.kind === "confirming" ? rowState.action : null;
  const submitting = rowState.kind === "submitting";

  return (
    <article className="rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-semibold tracking-tight text-fg">{identity}</span>
        {request.domain ? (
          <span className="text-[13px] text-fg-muted">from {request.domain}</span>
        ) : null}
        <span className="text-[13px] text-fg-muted">
          wants to follow <span className="font-medium text-fg">{request.channel_handle}</span>
        </span>
        <span className="text-[13px] text-fg-muted">
          requested {relativeTime(request.created_at)}
        </span>
      </div>

      {request.handle ? (
        <p className="mt-1 break-all text-xs text-fg-muted">{request.actor_url}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm text-fg-muted">
              {confirming === "approve"
                ? `Accept ${identity} as a follower? Your channel's public activity will federate to them.`
                : `Reject ${identity}? The pending follow is removed and a Reject is sent.`}
            </span>
            <Button
              size="sm"
              variant={confirming === "reject" ? "danger" : "primary"}
              aria-label={`Confirm ${confirming} for ${identity}`}
              disabled={submitting}
              onClick={() => void resolve(confirming)}
            >
              {confirming === "approve" ? "Confirm approve" : "Confirm reject"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => setRowState({ kind: "idle" })}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              aria-label={`Approve ${identity}`}
              disabled={submitting}
              onClick={() => setRowState({ kind: "confirming", action: "approve" })}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Reject ${identity}`}
              disabled={submitting}
              onClick={() => setRowState({ kind: "confirming", action: "reject" })}
            >
              Reject
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
