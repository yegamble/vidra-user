"use client";

import { useCallback, useEffect, useState } from "react";

import { ServerIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { BlockedInstance } from "@/lib/api";
import { relativeTime } from "@/lib/format";

const MAX_REASON_LEN = 2000;

type Status = "loading" | "error" | "ready";

// AdminInstancesView is the moderator/admin federation blocklist: block a
// remote instance by domain (inbound activity from it is dropped, its content
// is hidden from every surface, outbound deliveries to it are cancelled) and
// unblock it again. Role-gated by RoleGate (an under-privileged/anonymous
// viewer sees the shared permission prompt and nothing fetches). Blocks are
// audited server-side.
export function AdminInstancesView() {
  return (
    <RoleGate minRole="moderator" action="manage the instance blocklist">
      <InstancesList />
    </RoleGate>
  );
}

function InstancesList() {
  const [status, setStatus] = useState<Status>("loading");
  const [instances, setInstances] = useState<BlockedInstance[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getBlockedInstances({ limit: 100 }, controller.signal)
      .then((res) => {
        setInstances(res.instances);
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  const onBlocked = useCallback((instance: BlockedInstance) => {
    setInstances((prev) => [instance, ...prev.filter((i) => i.domain !== instance.domain)]);
  }, []);

  const onUnblocked = useCallback((domain: string) => {
    setInstances((prev) => prev.filter((i) => i.domain !== domain));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <BlockInstanceForm onBlocked={onBlocked} />

      {status === "loading" ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading blocked instances" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load the instance blocklist." onRetry={retry} />
      ) : instances.length === 0 ? (
        <EmptyState
          icon={<ServerIcon size={24} />}
          title="No blocked instances"
          message="Block a federated instance above and its content disappears from every surface on this server."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {instances.map((instance) => (
            <li key={instance.domain}>
              <BlockedInstanceRow instance={instance} onUnblocked={onUnblocked} />
            </li>
          ))}
        </ul>
      )}
    </div>
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
