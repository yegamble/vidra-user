"use client";

import { useCallback, useState } from "react";

import { useT } from "@/components/I18nProvider";
import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { ServerIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { BlockedInstance } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAsyncAction } from "@/lib/use-async-action";
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
  const t = useT();
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
      errorMessage={t("admin.instances.loadError")}
      emptyIcon={<ServerIcon size={24} />}
      emptyTitle={t("admin.instances.emptyTitle")}
      emptyMessage={t("admin.instances.emptyMessage")}
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
  const t = useT();
  const [domain, setDomain] = useState("");
  const [reason, setReason] = useState("");
  const { run, busy, error, clearError } = useAsyncAction(
    async (trimmedDomain: string) => {
      // 204 on success; build the row locally (blocked "now", by the caller)
      // so the list reflects the block without a refetch — the next fetch
      // confirms persistence.
      await api.blockInstance({ domain: trimmedDomain, reason: reason.trim() || undefined });
      onBlocked({
        domain: trimmedDomain,
        reason: reason.trim(),
        blocked_at: new Date().toISOString(),
        source: "manual",
      });
      setDomain("");
      setReason("");
    },
    t("admin.instances.blockError"),
    (err) =>
      err instanceof ApiError && err.status === 422
        ? t("admin.instances.invalidDomain")
        : null,
  );

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmedDomain = domain.trim().toLowerCase();
        if (trimmedDomain === "" || busy) return;
        void run(trimmedDomain);
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          aria-label={t("admin.instances.domainLabel")}
          placeholder={t("admin.instances.domainPlaceholder")}
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            clearError();
          }}
          className="focus-ring w-full max-w-xs rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <input
          type="text"
          aria-label={t("admin.block.reasonLabel")}
          placeholder={t("admin.instances.reasonPlaceholder")}
          maxLength={MAX_REASON_LEN}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Button type="submit" size="sm" disabled={busy || domain.trim() === ""}>
          {busy ? t("admin.action.blocking") : t("admin.action.block")}
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
  const t = useT();
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
      setError(errorMessage(err, t("admin.instances.unblockError")));
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
          {t("admin.instances.blockedAgo", { when: relativeTime(instance.blocked_at) })}
        </p>
        {instance.reason ? (
          <p className="mt-1 text-[13px] text-fg-muted">{instance.reason}</p>
        ) : null}
        {instance.source?.startsWith("subscription:") ? (
          <p className="mt-1 text-[13px] text-fg-muted">
            {t("admin.instances.fromSubscription")}
          </p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        disabled={busy}
        aria-label={t("admin.action.unblockTarget", { name: instance.domain })}
        onClick={() => void unblock()}
      >
        {t("admin.action.unblock")}
      </Button>
    </div>
  );
}
