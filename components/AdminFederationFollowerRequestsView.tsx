"use client";

import { useState } from "react";

import { useT } from "@/components/I18nProvider";
import { SLOT, withSlot } from "@/components/admin/messageSlot";
import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { GlobeIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { api, errorMessage } from "@/lib/api";
import type { FederationFollowerRequest } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

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
      <ListBoundary label="follower requests">
        <RequestQueue />
      </ListBoundary>
    </RoleGate>
  );
}

function RequestQueue() {
  const t = useT();
  const list = usePagedList<FederationFollowerRequest>({
    load: (query, signal) =>
      api
        .getFederationFollowerRequests({ limit: query.limit, offset: query.offset }, signal)
        .then((res) => ({
          items: res.requests,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  return (
    <PagedListShell
      list={list}
      noun="follower request"
      errorMessage={t("admin.followers.loadError")}
      emptyIcon={<GlobeIcon size={24} />}
      emptyTitle={t("admin.followers.emptyTitle")}
      emptyMessage={t("admin.followers.emptyMessage")}
    >
      <ul className="flex flex-col gap-3">
        {list.items.map((request) => (
          <li key={request.id}>
            {/* A resolved request leaves the pending queue for good — the queue
                only ever holds unresolved follows, so it leaves the total too. */}
            <RequestRow
              request={request}
              onResolved={(id) => list.drop((r) => r.id !== id)}
            />
          </li>
        ))}
      </ul>
    </PagedListShell>
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
  const t = useT();
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
            ? t("admin.followers.approveError")
            : t("admin.followers.rejectError"),
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
          <span className="text-[13px] text-fg-muted">{t("admin.followers.from", { domain: request.domain })}</span>
        ) : null}
        <span className="text-[13px] text-fg-muted">
          {withSlot(
            t("admin.followers.wants", { channel: SLOT }),
            <span className="font-medium text-fg">{request.channel_handle}</span>,
          )}
        </span>
        <span className="text-[13px] text-fg-muted">
          {t("admin.followers.requested", { when: relativeTime(request.created_at) })}
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
                ? t("admin.followers.confirmApproveText", { name: identity })
                : t("admin.followers.confirmRejectText", { name: identity })}
            </span>
            <Button
              size="sm"
              variant={confirming === "reject" ? "danger" : "primary"}
              aria-label={t(
                confirming === "approve"
                  ? "admin.followers.confirmApproveAria"
                  : "admin.followers.confirmRejectAria",
                { name: identity },
              )}
              disabled={submitting}
              onClick={() => void resolve(confirming)}
            >
              {confirming === "approve"
                ? t("admin.followers.confirmApprove")
                : t("admin.followers.confirmReject")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => setRowState({ kind: "idle" })}
            >
              {t("common.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              aria-label={t("admin.followers.approveAria", { name: identity })}
              disabled={submitting}
              onClick={() => setRowState({ kind: "confirming", action: "approve" })}
            >
              {t("admin.action.approve")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={t("admin.followers.rejectAria", { name: identity })}
              disabled={submitting}
              onClick={() => setRowState({ kind: "confirming", action: "reject" })}
            >
              {t("admin.action.reject")}
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
