"use client";

import Link from "next/link";

import { WarningIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { SystemStatus, SystemStatusDatabase } from "@/lib/api";
import { formatUptime, formatVersion } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";

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

// Exported for unit tests (rendered directly, bypassing the RoleGate wrapper —
// the same pattern InfrastructurePanel uses). Production always enters via
// AdminSystemStatusView so the admin gate applies.
export function StatusPanel() {
  const { status, data, retry: refresh } = useApiResource<SystemStatus>((signal) =>
    api.getSystemStatus(signal),
  );

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
        <Row label="Software" value={`${data.software.name} ${formatVersion(data.software.version)}`} />
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

      {/* Absent, not zeroed, when this process has no pool attached — so the
          section is dropped whole rather than rendered as "0 of 0", which is
          indistinguishable from a pool with nothing left. */}
      {data.database ? <DatabasePool pool={data.database} /> : null}
    </div>
  );
}

/**
 * The live connection pool. It sits below the dependency list because it
 * answers the question after that one: postgres being up says nothing about
 * whether THIS process has a connection left to talk to it with, and a pool
 * that has run out looks, from the outside, exactly like a slow database.
 */
function DatabasePool({ pool }: { pool: SystemStatusDatabase }) {
  // acquired + idle + constructing == total, and total can never exceed max, so
  // "acquired pinned at max" is the whole diagnosis. Warning tone, not danger:
  // one sample at the ceiling is normal under burst — it is a hint about where
  // to look next, not an outage.
  const saturated =
    pool.pool_max_conns > 0 && pool.pool_acquired_conns >= pool.pool_max_conns;

  return (
    <section aria-label="Database pool">
      <h2 className="mb-2 text-[15px] font-bold tracking-tight">Database pool</h2>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Row label="In use" value={`${pool.pool_acquired_conns} of ${pool.pool_max_conns}`} />
        <Row label="Idle" value={String(pool.pool_idle_conns)} />
        <Row label="Open connections" value={String(pool.pool_total_conns)} />
      </dl>
      {saturated ? (
        <p className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-warning">
          <WarningIcon size={15} className="mt-0.5 shrink-0" />
          <span>
            Every connection in this process&rsquo;s pool is checked out, so the next query
            waits for one to come back. If it stays here, raise the{" "}
            <Link
              href="/admin/infrastructure"
              className="font-medium underline underline-offset-2"
            >
              pool limit
            </Link>{" "}
            or shed load — every api and worker process holds its own pool
            against the same database, so the ceiling is a share of a
            server-wide budget, not a free dial.
          </span>
        </p>
      ) : null}
    </section>
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
