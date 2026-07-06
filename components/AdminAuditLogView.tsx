"use client";

import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { AuditLogEntry } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// AdminAuditLogView is the admin-only security audit trail, role-gated by
// RoleGate (an under-privileged/anonymous viewer sees the shared permission
// prompt and nothing fetches).
export function AdminAuditLogView() {
  return (
    <RoleGate minRole="admin" action="view the audit log">
      <AuditList />
    </RoleGate>
  );
}

function AuditList() {
  const [status, setStatus] = useState<Status>("loading");
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [action, setAction] = useState("");
  const [input, setInput] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getAuditLog({ action: action || undefined, limit: 100 }, controller.signal)
      .then((res) => {
        setEntries(res.entries);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [action, reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setStatus("loading");
          setAction(input.trim());
        }}
      >
        <input
          aria-label="Filter by action"
          placeholder="Filter by action (e.g. auth.login)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="focus-ring flex-1 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Button type="submit" size="sm">
          Filter
        </Button>
        {action ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setInput("");
              setStatus("loading");
              setAction("");
            }}
          >
            Clear
          </Button>
        ) : null}
      </form>

      {status === "loading" ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading audit log" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load the audit log." onRetry={retry} />
      ) : entries.length === 0 ? (
        <EmptyState title="No audit entries" message="No security-audit events match this view." />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-fg">
                  {e.action}
                </code>
                <span
                  className={
                    e.result === "failure"
                      ? "inline-flex items-center rounded-full bg-danger-surface px-2 py-0.5 text-[10.5px] font-bold tracking-[0.04em] text-danger uppercase"
                      : "inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[10.5px] font-bold tracking-[0.04em] text-success uppercase"
                  }
                >
                  {e.result}
                </span>
                <span className="text-xs text-fg-muted">{relativeTime(e.occurred_at)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 text-[13px] text-fg-muted">
                <span>
                  Actor:{" "}
                  <span className="font-medium text-fg">
                    {e.actor_username || e.actor_id || "—"}
                  </span>
                </span>
                {e.reason ? <span>Reason: {e.reason}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
