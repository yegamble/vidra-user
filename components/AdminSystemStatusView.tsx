"use client";

import Link from "next/link";

import { WarningIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type {
  SystemStatus,
  SystemStatusCdnPurge,
  SystemStatusDatabase,
  SystemStatusRateLimits,
} from "@/lib/api";
import { formatDateTime, formatUptime, formatVersion } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";

/**
 * Operator-facing names for the server's probe vocabulary (postgres, redis,
 * s3, smtp, search, ffmpeg, settings_sync — internal/httpapi/system_probes.go).
 * An unknown key is humanized rather than dropped, the same contract the
 * feature list on the Infrastructure page keeps: the server may ship a probe
 * before this client learns its name, and hiding it would hide a dependency.
 */
const COMPONENT_LABEL: Record<string, string> = {
  postgres: "PostgreSQL",
  redis: "Redis",
  s3: "Object storage",
  smtp: "Outbound mail",
  search: "Search",
  ffmpeg: "Media tooling (ffmpeg)",
  settings_sync: "Settings sync",
};

/** ok | down | not_configured, said in words rather than wire enums. */
const COMPONENT_STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  down: "Down",
  not_configured: "Not configured",
};

function componentLabel(key: string): string {
  return COMPONENT_LABEL[key] ?? key.replace(/_/g, " ");
}

function componentStatusLabel(status: string): string {
  return COMPONENT_STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

/**
 * The overall pill. "draining" wins over the other two exactly as on /readyz:
 * the process received SIGTERM and keeps answering through the drain delay, so
 * an admin watching a rolling deploy sees the same fact the load balancer acts
 * on. Warning tone, not ok/degraded — a deploy in progress is neither health
 * nor an outage.
 */
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  degraded: { label: "Degraded", className: "bg-danger-surface text-danger" },
  draining: { label: "Draining", className: "bg-warning/15 text-warning" },
  ok: { label: "Healthy", className: "bg-success/15 text-success" },
};

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
  const badge = STATUS_BADGE[data.status] ?? STATUS_BADGE.ok;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
        <Button variant="secondary" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>
      {data.status === "draining" ? (
        <p className="text-[13px] leading-relaxed text-fg-muted">
          This process received a shutdown signal and is leaving. It keeps
          serving through the drain delay — the same fact /readyz reports to
          the load balancer during a deploy.
        </p>
      ) : null}

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
                    <span className="truncate text-sm font-medium text-fg">
                      {componentLabel(name)}
                    </span>
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
                    {componentStatusLabel(c.status)}
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

      {/* Guarded even though the current contract always sends it: an older
          backend that predates the field drops the section, never a crash. */}
      {data.rate_limits ? <RateLimits limits={data.rate_limits} /> : null}

      {/* ABSENT — not zeroed — when no CDN is wired: absence is the good news
          it reads as, and zero runs on an edgeless install would read as a
          purge system that never works. */}
      {data.cdn_purge ? <CdnPurge purge={data.cdn_purge} /> : null}
    </div>
  );
}

/**
 * The effective rate-limit configuration, read-only. Rate limits are a
 * deploy-time capacity decision (RATE_LIMIT_* / AUTH_RATE_LIMIT_* env) with no
 * runtime mutation endpoint by decision, so this section exists for exactly
 * one job: letting an operator confirm what is actually applied.
 */
function RateLimits({ limits }: { limits: SystemStatusRateLimits }) {
  return (
    <section aria-label="Rate limits">
      <h2 className="mb-2 text-[15px] font-bold tracking-tight">Rate limits</h2>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Row label="Rate limiting" value={limits.enabled ? "On" : "Off"} />
        {limits.enabled ? (
          <>
            <Row
              label="General budget"
              value={`${limits.requests} requests / ${limits.window_seconds}s per IP`}
            />
            <Row
              label="Auth budget"
              value={`${limits.auth_requests} requests / ${limits.window_seconds}s per IP`}
            />
          </>
        ) : null}
      </dl>
    </section>
  );
}

/**
 * The CDN purge record: in-process counters since boot (a restart resets
 * them). Purge success is otherwise silent and failure one aggregate log
 * line, so this section is where "is invalidation actually working" gets a
 * visible answer. The incomplete-run marker follows the pool-saturation
 * idiom: a dated warning, because the edge may still be serving whatever
 * that run covered.
 */
function CdnPurge({ purge }: { purge: SystemStatusCdnPurge }) {
  return (
    <section aria-label="CDN purge">
      <h2 className="mb-2 text-[15px] font-bold tracking-tight">CDN purge</h2>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Row label="Purge runs since boot" value={String(purge.runs)} />
        <Row label="Keys purged" value={String(purge.keys_purged)} />
        <Row label="Keys failed" value={String(purge.keys_failed)} />
      </dl>
      {purge.last_incomplete_run_at ? (
        <p className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-warning">
          <WarningIcon size={15} className="mt-0.5 shrink-0" />
          <span>
            A purge run last ended incomplete on{" "}
            {formatDateTime(purge.last_incomplete_run_at)} — the edge may still
            be serving something that run was meant to clear.
          </span>
        </p>
      ) : null}
    </section>
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
            waits for one to come back. If it stays here, check the{" "}
            {/* The destination is a read-only report of DB_MAX_CONNS, not a
                dial — so the sentence promises what that page delivers instead
                of a "raise the limit" control that is not there. */}
            <Link
              href="/admin/infrastructure"
              className="font-medium underline underline-offset-2"
            >
              pool sizing this deployment chose
            </Link>{" "}
            (DB_MAX_CONNS) or shed load — every api and worker process holds
            its own pool against the same database, so the ceiling is a share
            of a server-wide budget, not a free dial.
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
