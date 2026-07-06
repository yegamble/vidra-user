"use client";

import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
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
          className="w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <input
          type="text"
          aria-label="Reason for blocking (optional)"
          placeholder="Reason (optional, recorded in the audit trail)"
          maxLength={MAX_REASON_LEN}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={busy || domain.trim() === ""}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Blocking…" : "Block"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {instance.domain}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          blocked {relativeTime(instance.blocked_at)}
        </p>
        {instance.reason ? (
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{instance.reason}</p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={busy}
        aria-label={`Unblock ${instance.domain}`}
        onClick={() => void unblock()}
        className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Unblock
      </button>
    </div>
  );
}
