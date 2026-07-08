"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { ChevronRightIcon } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { AuditLogEntry, JobsOverview, SystemStatus } from "@/lib/api";
import { formatUptime, relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// The reports list is capped at this page size; the contract carries no total,
// so a full first page renders as "100+" rather than pretending it's exact.
const REPORTS_PAGE = 100;
// The overview shows a short recent-audit tail; the full trail lives at /admin/audit-log.
const AUDIT_PREVIEW = 6;

// NOTE (design refresh DR11 / spec §5.4): the design's Overview leads with four
// aggregate stat cards (Users / Published videos / Media stored / Federated
// peers). No aggregate-counts endpoint exists in the contract at execution time
// (verified fresh in vidra-core/api/openapi.yaml — no /admin/stats), so those
// cards are deferred rather than faked. The dashboard binds only to what is real:
// GET /admin/system (health), /admin/jobs (queues), /admin/audit-log (trail),
// /admin/reports (open count). IPFS-gateway health is likewise deferred — its
// /ipfs/status endpoint 501s until P19.2, so the Health card reflects exactly the
// dependencies /admin/system reports, never a fabricated S3/RTMP/IPFS row.

const SECTIONS = [
  {
    href: "/admin/users",
    label: "Users",
    description: "Search accounts and manage their role and active status.",
  },
  {
    href: "/admin/registration-requests",
    label: "Registration",
    description: "Review pending signups and approve or reject them.",
  },
  {
    href: "/admin/config",
    label: "Configuration",
    description: "Instance identity, registration, feature toggles, and moderation gates.",
  },
  {
    href: "/admin/jobs",
    label: "Jobs",
    description: "Background-work queue depth, stuck workers, and recent failures.",
  },
  {
    href: "/admin/media",
    label: "Media storage",
    description: "Garbage-collect stored media objects with no database reference.",
  },
  {
    href: "/admin/audit-log",
    label: "Audit log",
    description: "The security audit trail of admin and auth actions.",
  },
  {
    href: "/admin/system",
    label: "System",
    description: "Build info, environment, uptime, and dependency health.",
  },
];

// AdminOverview is the /admin index: the design's operations dashboard — instance
// health, background-job queues, a recent audit-log tail, the open-reports
// callout — over the real admin read endpoints, plus cards linking to each admin
// section. Role-gated by RoleGate (an under-privileged/anonymous viewer sees the
// shared permission prompt and nothing fetches).
export function AdminOverview() {
  return (
    <RoleGate minRole="admin" action="view the overview">
      <OverviewBody />
    </RoleGate>
  );
}

function OverviewBody() {
  return (
    <div className="flex flex-col gap-6">
      <Dashboard />
      <section aria-label="Admin sections">
        <h2 className="px-0.5 pb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
          Manage
        </h2>
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="focus-ring flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-strong"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold tracking-tight text-fg">{s.label}</span>
                  <span className="mt-0.5 block text-[13px] text-fg-muted">{s.description}</span>
                </span>
                <ChevronRightIcon size={14} strokeWidth={2.2} className="shrink-0 text-fg-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// Dashboard loads the four read endpoints together (one AbortController) and
// stores each result independently, so a single broken read degrades to its own
// inline retry instead of blanking the page.
function Dashboard() {
  const [status, setStatus] = useState<Status>("loading");
  const [system, setSystem] = useState<SystemStatus | null>(null);

  const [reportsStatus, setReportsStatus] = useState<Status>("loading");
  const [openReports, setOpenReports] = useState(0);
  const [openReportsFullPage, setOpenReportsFullPage] = useState(false);

  const [jobsStatus, setJobsStatus] = useState<Status>("loading");
  const [jobs, setJobs] = useState<JobsOverview | null>(null);

  const [auditStatus, setAuditStatus] = useState<Status>("loading");
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const aborted = () => signal.aborted;

    api
      .getSystemStatus(signal)
      .then((res) => {
        setSystem(res);
        setStatus("ready");
      })
      .catch(() => {
        if (!aborted()) setStatus("error");
      });
    api
      .getReports({ openOnly: true, limit: REPORTS_PAGE }, signal)
      .then((res) => {
        setOpenReports(res.reports.length);
        setOpenReportsFullPage(res.reports.length >= REPORTS_PAGE);
        setReportsStatus("ready");
      })
      .catch(() => {
        if (!aborted()) setReportsStatus("error");
      });
    api
      .getJobs(signal)
      .then((res) => {
        setJobs(res);
        setJobsStatus("ready");
      })
      .catch(() => {
        if (!aborted()) setJobsStatus("error");
      });
    api
      .getAuditLog({ limit: AUDIT_PREVIEW }, signal)
      .then((res) => {
        setAudit(res.entries);
        setAuditStatus("ready");
      })
      .catch(() => {
        if (!aborted()) setAuditStatus("error");
      });

    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReportsStatus("loading");
    setJobsStatus("loading");
    setAuditStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <HealthCard status={status} system={system} onRetry={retry} />
      <QueuesCard status={jobsStatus} jobs={jobs} onRetry={retry} />
      <AuditCard status={auditStatus} entries={audit} onRetry={retry} />
      <ReportsCallout
        status={reportsStatus}
        openReports={openReports}
        fullPage={openReportsFullPage}
        onRetry={retry}
      />
    </div>
  );
}

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="px-0.5 pb-2 text-[15px] font-bold tracking-tight text-fg">{title}</h2>
      {children}
    </section>
  );
}

// HealthCard renders exactly the dependencies /admin/system reports (postgres,
// redis, and whatever else the backend exposes) — no fabricated rows.
function HealthCard({
  status,
  system,
  onRetry,
}: {
  status: Status;
  system: SystemStatus | null;
  onRetry: () => void;
}) {
  return (
    <CardShell title="Health">
      {status === "loading" ? (
        <CardSpinner label="Loading health" />
      ) : status === "error" || system === null ? (
        <ErrorState message="Could not load the system health." onRetry={onRetry} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-surface-muted">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle px-4 py-3">
            <Badge variant={system.status === "degraded" ? "danger" : "success"}>
              {system.status === "degraded" ? "Degraded" : "Healthy"}
            </Badge>
            <span className="text-[13px] font-semibold tracking-tight text-fg">
              {system.software.name} {system.software.version}
            </span>
            <span className="text-[12.5px] text-fg-muted tabular-nums">
              up {formatUptime(system.uptime_seconds)}
            </span>
            <Link
              href="/admin/system"
              className="focus-ring ml-auto rounded text-[12.5px] font-semibold text-fg-muted underline underline-offset-2 transition-colors hover:text-fg"
            >
              Details
            </Link>
          </div>
          {Object.keys(system.components).sort().map((name, i) => {
            const c = system.components[name];
            const down = c.status !== "ok" && c.status !== "not_configured";
            return (
              <div
                key={name}
                className={`flex items-center gap-2.5 px-4 py-3 ${i > 0 ? "border-t border-border-subtle" : ""}`}
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 flex-none rounded-full ${
                    down ? "bg-danger-solid" : c.status === "not_configured" ? "bg-border" : "bg-success"
                  }`}
                />
                <span className="text-sm font-medium text-fg">{prettyComponent(name)}</span>
                <span
                  className={`ml-auto text-[12.5px] ${down ? "text-danger" : "text-fg-muted"}`}
                  title={c.error || undefined}
                >
                  {c.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </CardShell>
  );
}

function QueuesCard({
  status,
  jobs,
  onRetry,
}: {
  status: Status;
  jobs: JobsOverview | null;
  onRetry: () => void;
}) {
  return (
    <CardShell title="Job queues">
      {status === "loading" ? (
        <CardSpinner label="Loading job queues" />
      ) : status === "error" || jobs === null ? (
        <ErrorState message="Could not load the job queues." onRetry={onRetry} />
      ) : jobs.queues.length === 0 ? (
        <p className="rounded-2xl bg-surface-muted px-4 py-3.5 text-[13px] text-fg-muted">
          No background-work queues are being tracked.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-surface-muted">
          {[...jobs.queues]
            .sort((a, b) => a.queue.localeCompare(b.queue))
            .map((q, i) => (
              <div
                key={q.queue}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border-subtle" : ""}`}
              >
                <span className="text-sm font-medium text-fg">{prettyComponent(q.queue)}</span>
                <span
                  className={`ml-auto text-[12.5px] tabular-nums ${q.failed > 0 ? "text-danger" : "text-fg-muted"}`}
                >
                  {queueMeta(q)}
                </span>
              </div>
            ))}
        </div>
      )}
    </CardShell>
  );
}

function AuditCard({
  status,
  entries,
  onRetry,
}: {
  status: Status;
  entries: AuditLogEntry[];
  onRetry: () => void;
}) {
  return (
    <CardShell title="Recent audit log">
      {status === "loading" ? (
        <CardSpinner label="Loading audit log" />
      ) : status === "error" ? (
        <ErrorState message="Could not load the audit log." onRetry={onRetry} />
      ) : entries.length === 0 ? (
        <p className="rounded-2xl bg-surface-muted px-4 py-3.5 text-[13px] text-fg-muted">
          No recent security-audit events.
        </p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-3 border-b border-border-subtle py-2.5">
              <span className="flex-none pt-0.5 font-mono text-[11px] font-bold text-fg-subtle tabular-nums">
                {relativeTime(e.occurred_at)}
              </span>
              <div className="min-w-0">
                <div className="text-[13px] leading-snug text-fg">
                  <span className="font-semibold">{e.actor_username || e.actor_id || "system"}</span>{" "}
                  <span className="text-fg-muted">{e.result === "failure" ? "failed to run" : "ran"}</span>
                </div>
                <div className="mt-0.5 font-mono text-[11.5px] text-fg-subtle">{e.action}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

// ReportsCallout keeps the open-reports lead-in linking to the moderation queue.
function ReportsCallout({
  status,
  openReports,
  fullPage,
  onRetry,
}: {
  status: Status;
  openReports: number;
  fullPage: boolean;
  onRetry: () => void;
}) {
  if (status === "loading") {
    return (
      <p className="text-sm text-fg-muted" aria-busy="true">
        Loading open reports…
      </p>
    );
  }
  if (status === "error") {
    return (
      <p role="alert" className="text-sm text-danger">
        Could not load the open-reports count.{" "}
        <button
          type="button"
          onClick={onRetry}
          className="focus-ring rounded font-semibold underline underline-offset-2"
        >
          Retry
        </button>
      </p>
    );
  }
  return (
    <p className="text-sm text-fg">
      {openReports === 0 ? (
        "No open reports."
      ) : (
        <>
          <span className="font-semibold tabular-nums">
            {fullPage ? `${REPORTS_PAGE}+` : openReports}
          </span>{" "}
          open {openReports === 1 && !fullPage ? "report" : "reports"}
        </>
      )}{" "}
      <Link
        href="/moderation"
        className="focus-ring rounded font-semibold text-fg-muted underline underline-offset-2 transition-colors hover:text-fg"
      >
        Moderation queue
      </Link>
    </p>
  );
}

function CardSpinner({ label }: { label: string }) {
  return (
    <div className="flex justify-center rounded-2xl bg-surface-muted py-8">
      <Spinner label={label} />
    </div>
  );
}

// Turn snake_case dependency/queue keys into readable labels (transcode_jobs →
// "Transcode jobs", object_storage → "Object storage").
function prettyComponent(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function queueMeta(q: JobsOverview["queues"][number]): string {
  if (q.failed > 0) {
    const oldest = q.pending > 0 ? ` · oldest ${formatUptime(q.oldest_pending_age_seconds)}` : "";
    return `${q.failed} failed${oldest}`;
  }
  if (q.pending > 0) {
    return `${q.pending} pending · oldest ${formatUptime(q.oldest_pending_age_seconds)}`;
  }
  if (q.running > 0) return `${q.running} running`;
  return "idle";
}
