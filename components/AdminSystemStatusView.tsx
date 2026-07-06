"use client";

import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { SystemStatus } from "@/lib/api";
import { formatUptime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// AdminSystemStatusView is the admin-only operational dashboard: build info,
// the runtime environment, uptime, and per-dependency health. Read-only;
// role-gated by RoleGate (an under-privileged/anonymous viewer sees the shared
// permission prompt and nothing fetches).
export function AdminSystemStatusView() {
  return (
    <RoleGate minRole="admin" action="view system status">
      <StatusPanel />
    </RoleGate>
  );
}

function StatusPanel() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<SystemStatus | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getSystemStatus(controller.signal)
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
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading system status" />
      </div>
    );
  }
  if (status === "error" || data === null) {
    return <ErrorState message="Could not load system status." onRetry={refresh} />;
  }

  const componentNames = Object.keys(data.components).sort();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span
          className={
            data.status === "degraded"
              ? "inline-flex items-center rounded-full bg-danger-surface px-3 py-1 text-[13px] font-semibold text-danger"
              : "inline-flex items-center rounded-full bg-success/15 px-3 py-1 text-[13px] font-semibold text-success"
          }
        >
          {data.status === "degraded" ? "Degraded" : "Healthy"}
        </span>
        <Button variant="secondary" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Row label="Software" value={`${data.software.name} ${data.software.version}`} />
        <Row label="Commit" value={data.software.commit} mono />
        <Row label="Build date" value={data.software.build_date} />
        <Row label="Go version" value={data.software.go_version} />
        <Row label="Environment" value={data.environment} />
        <Row label="Uptime" value={formatUptime(data.uptime_seconds)} />
      </dl>

      <section>
        <h2 className="mb-2 text-[15px] font-bold tracking-tight">Dependencies</h2>
        {componentNames.length === 0 ? (
          <EmptyState title="No components" message="No dependencies are being tracked." />
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-2xl bg-surface-muted px-4">
            {componentNames.map((name) => {
              const c = data.components[name];
              const down = c.status !== "ok" && c.status !== "not_configured";
              return (
                <li key={name} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className={`h-2 w-2 flex-none rounded-full ${
                        down
                          ? "bg-danger-solid"
                          : c.status === "not_configured"
                            ? "bg-border"
                            : "bg-success"
                      }`}
                    />
                    <span className="truncate text-sm font-medium text-fg">{name}</span>
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-[0.04em] uppercase ${
                      down
                        ? "bg-danger-surface text-danger"
                        : c.status === "not_configured"
                          ? "bg-surface-strong text-fg-muted"
                          : "bg-success/15 text-success"
                    }`}
                    title={c.error || undefined}
                  >
                    {c.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border-subtle py-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={mono ? "truncate font-mono text-[13px] text-fg" : "text-fg tabular-nums"}>
        {value || "—"}
      </dd>
    </div>
  );
}
