"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminJobRunsView } from "@/components/AdminJobRunsView";
import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { JobsOverview } from "@/lib/api";
import { formatCount, formatUptime, relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// A pending item older than this is a stuck-worker signal — highlight the card.
const STUCK_AGE_SECONDS = 10 * 60;

// AdminJobsView is the admin-only worker/queue operations page. It reads the
// durable job-queue snapshot (GET /admin/jobs) and renders a per-queue card grid
// plus a recent-failures table, with a manual Refresh. Read-only; role-gated by
// RoleGate (an under-privileged/anonymous viewer sees the shared permission
// prompt and nothing fetches).
export function AdminJobsView() {
  return (
    <RoleGate minRole="admin" action="view job status">
      <JobsPanel />
    </RoleGate>
  );
}

function JobsPanel() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<JobsOverview | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getJobs(controller.signal)
      .then((res) => {
        setData(res);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => {
    // Keep the current snapshot (and the execution browser's filter/detail
    // state) mounted during an ordinary refresh. Initial/error retries still
    // use the full loading state because there is no usable snapshot yet.
    if (data === null) setStatus("loading");
    setReloadKey((k) => k + 1);
  }, [data]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading job status" />
      </div>
    );
  }
  if (status === "error" || data === null) {
    return <ErrorState message="Could not load job status." onRetry={refresh} />;
  }

  const queues = [...data.queues].sort((a, b) => a.queue.localeCompare(b.queue));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {queues.length} {queues.length === 1 ? "queue" : "queues"}
        </p>
        <Button variant="secondary" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      {queues.length === 0 ? (
        <EmptyState title="No queues" message="No background-work queues are being tracked." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Job queues">
          {queues.map((q) => {
            const stuck = q.pending > 0 && q.oldest_pending_age_seconds >= STUCK_AGE_SECONDS;
            // Failed queues carry a danger ring, stuck (backed-up) queues a
            // warning ring; healthy queues sit on the plain elevated surface.
            // A ring (not a fill) keeps the inner danger Badge and danger stat
            // value legible on the surface — a danger fill would blend with the
            // Badge and can't clear AA under the danger text.
            const cardTone =
              q.failed > 0
                ? "bg-surface shadow-soft ring-1 ring-inset ring-danger/30"
                : stuck
                  ? "bg-surface shadow-soft ring-1 ring-inset ring-warning/40"
                  : "bg-surface shadow-soft";
            return (
              <li key={q.queue}>
                <div className={`flex h-full flex-col gap-3 rounded-2xl p-4 ${cardTone}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium text-fg">{q.queue}</span>
                    {q.failed > 0 ? (
                      <Badge variant="danger">{formatCount(q.failed)} failed</Badge>
                    ) : stuck ? (
                      <Badge variant="warning">stuck</Badge>
                    ) : (
                      <Badge variant="success">ok</Badge>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <Stat label="Pending" value={q.pending} emphasize={q.pending > 0} />
                    <Stat label="Running" value={q.running} />
                    <Stat label="Done" value={q.done} />
                    <Stat label="Failed" value={q.failed} danger={q.failed > 0} />
                  </dl>
                  <p className={`text-xs ${stuck ? "text-warning" : "text-fg-muted"}`}>
                    {q.pending > 0
                      ? `Oldest pending ${formatUptime(q.oldest_pending_age_seconds)} old`
                      : "Nothing pending"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AdminJobRunsView refreshKey={reloadKey} />

      <section aria-label="Recent failures">
        <h2 className="mb-2 text-[15px] font-bold tracking-tight">Recent failures</h2>
        {data.recent_failures.length === 0 ? (
          <EmptyState title="No recent failures" message="No jobs have dead-lettered recently." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border-subtle">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-border-subtle text-[10.5px] font-bold uppercase tracking-[0.05em] text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2.5">Queue</th>
                  <th scope="col" className="px-3 py-2.5">Error</th>
                  <th scope="col" className="px-3 py-2.5">Attempts</th>
                  <th scope="col" className="px-3 py-2.5">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.recent_failures.map((f) => (
                  <tr key={f.id}>
                    <td className="px-3 py-2 align-top font-mono text-xs text-fg-muted">{f.queue}</td>
                    <td className="px-3 py-2 align-top text-fg">{f.error}</td>
                    <td className="px-3 py-2 align-top text-fg-muted tabular-nums">{f.attempts}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-fg-muted">
                      {relativeTime(f.failed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasize,
  danger,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-fg-muted">{label}</dt>
      <dd
        className={`tabular-nums ${
          danger && value > 0
            ? "font-semibold text-danger"
            : emphasize
              ? "font-semibold text-fg"
              : "text-fg"
        }`}
      >
        {formatCount(value)}
      </dd>
    </div>
  );
}
