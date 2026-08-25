"use client";

import { useCallback, useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { ServerIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { BlockedInstance } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

const MAX_REASON_LEN = 2000;

// AdminInstancesView is the moderator/admin federation blocklist: block a
// remote instance by domain (inbound activity from it is dropped, its content
// is hidden from every surface, outbound deliveries to it are cancelled) and
// unblock it again. Role-gated by RoleGate (an under-privileged/anonymous
// viewer sees the shared permission prompt and nothing fetches). Blocks are
// audited server-side.
export function AdminInstancesView() {
  return (
    <RoleGate minRole="moderator" action="manage the instance blocklist">
      <ListBoundary label="blocked instances">
        <InstancesList />
      </ListBoundary>
    </RoleGate>
  );
}

function InstancesList() {
  const list = usePagedList<BlockedInstance>({
    load: (query, signal) =>
      api
        .getBlockedInstances({ limit: query.limit, offset: query.offset }, signal)
        .then((res) => ({
          items: res.instances,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  const { items, patch, prepend } = list;
  // Blocking is idempotent: re-blocking a domain already on the page refreshes
  // its reason rather than adding a row, so that path patches instead of
  // prepending — otherwise the total would climb on a no-op.
  const onBlocked = useCallback(
    (instance: BlockedInstance) => {
      if (items.some((i) => i.domain === instance.domain)) {
        patch((rows) => rows.map((i) => (i.domain === instance.domain ? instance : i)));
      } else {
        prepend(instance);
      }
    },
    [items, patch, prepend],
  );

  return (
    <PagedListShell
      list={list}
      noun="blocked instance"
      toolbar={<BlockInstanceForm onBlocked={onBlocked} />}
      errorMessage="Could not load the instance blocklist."
      emptyIcon={<ServerIcon size={24} />}
      emptyTitle="No blocked instances"
      emptyMessage="Block a federated instance above and its content disappears from every surface on this server."
    >
      <ul className="flex flex-col gap-2">
        {list.items.map((instance) => (
          <li key={instance.domain}>
            <BlockedInstanceRow
              instance={instance}
              onUnblocked={(domain) => list.drop((i) => i.domain !== domain)}
            />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

function BlockInstanceForm({ onBlocked }: { onBlocked: (instance: BlockedInstance) => void }) {
  const [domain, setDomain] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmedDomain = domain.trim().toLowerCase();
    if (trimmedDomain === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 204 on success; build the row locally (blocked "now", by the caller)
      // so the list reflects the block without a refetch — the next fetch
      // confirms persistence.
      await api.blockInstance({ domain: trimmedDomain, reason: reason.trim() || undefined });
      onBlocked({
        domain: trimmedDomain,
        reason: reason.trim(),
        blocked_at: new Date().toISOString(),
      });
      setDomain("");
      setReason("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError("Enter a valid instance domain (a bare hostname, optionally host:port).");
      } else {
        setError(errorMessage(err, "Could not block this instance."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          aria-label="Instance domain to block"
          placeholder="Instance domain, e.g. spam.example"
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            setError(null);
          }}
          className="focus-ring w-full max-w-xs rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <input
          type="text"
          aria-label="Reason for blocking (optional)"
          placeholder="Reason (optional, recorded in the audit trail)"
          maxLength={MAX_REASON_LEN}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Button type="submit" size="sm" disabled={busy || domain.trim() === ""}>
          {busy ? "Blocking…" : "Block"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function BlockedInstanceRow({
  instance,
  onUnblocked,
}: {
  instance: BlockedInstance;
  onUnblocked: (domain: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unblock() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.unblockInstance(instance.domain);
      onUnblocked(instance.domain);
    } catch (err) {
      setError(errorMessage(err, "Could not unblock this instance."));
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-fg">
          {instance.domain}
        </p>
        <p className="text-[13px] text-fg-muted">
          blocked {relativeTime(instance.blocked_at)}
        </p>
        {instance.reason ? (
          <p className="mt-1 text-[13px] text-fg-muted">{instance.reason}</p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        disabled={busy}
        aria-label={`Unblock ${instance.domain}`}
        onClick={() => void unblock()}
      >
        Unblock
      </Button>
    </div>
  );
}
