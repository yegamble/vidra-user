"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { AuditLogEntry } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// AdminAuditLogView is the admin-only security audit trail. A non-admin or
// anonymous viewer is gated out (the session lives in memory, so a hard reload
// lands here signed out — we show a permission prompt rather than fetching a 403).
export function AdminAuditLogView() {
  const { user } = useSession();

  if (user?.role !== "admin") {
    return (
      <EmptyState
        title="Administrators only"
        message={
          <>
            This page is for administrators.{" "}
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Sign in
            </Link>{" "}
            with an admin account to view the audit log.
          </>
        }
      />
    );
  }

  return <AuditList />;
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
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Filter
        </button>
        {action ? (
          <button
            type="button"
            onClick={() => {
              setInput("");
              setStatus("loading");
              setAction("");
            }}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Clear
          </button>
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
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  {e.action}
                </code>
                <span
                  className={
                    e.result === "failure"
                      ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400"
                      : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                  }
                >
                  {e.result}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{relativeTime(e.occurred_at)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 text-sm text-zinc-600 dark:text-zinc-400">
                <span>
                  Actor:{" "}
                  <span className="text-zinc-800 dark:text-zinc-200">
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
