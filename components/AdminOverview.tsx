"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { SystemStatus } from "@/lib/api";
import { formatUptime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// The reports list is capped at this page size; the contract carries no total,
// so a full first page renders as "100+" rather than pretending it's exact.
const REPORTS_PAGE = 100;

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

// AdminOverview is the /admin index: a live system summary (reusing the
// GET /admin/system snapshot), the open-reports count, and cards linking to the
// admin sections. Role-gated by RoleGate (an under-privileged/anonymous viewer
// sees the shared permission prompt and nothing fetches).
export function AdminOverview() {
  return (
    <RoleGate minRole="admin" action="view the overview">
      <OverviewBody />
    </RoleGate>
  );
}

function OverviewBody() {
  return (
    <div className="flex flex-col gap-8">
      <SystemSummary />
      <section aria-label="Admin sections">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="focus-ring block h-full rounded-2xl">
                <Card interactive className="h-full">
                  <span className="block text-sm font-semibold tracking-tight text-fg">{s.label}</span>
                  <span className="mt-1 block text-[13px] text-fg-muted">{s.description}</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// SystemSummary reuses GET /admin/system for a compact health line (status
// badge, version, uptime) and GET /admin/reports?status=open for the
// open-reports count. Each half loads/fails independently so a broken reports
// read never hides the health badge (and vice versa).
function SystemSummary() {
  const [status, setStatus] = useState<Status>("loading");
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [reportsStatus, setReportsStatus] = useState<Status>("loading");
  const [openReports, setOpenReports] = useState(0);
  const [openReportsFullPage, setOpenReportsFullPage] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getSystemStatus(controller.signal)
      .then((res) => {
        setSystem(res);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    api
      .getReports({ openOnly: true, limit: REPORTS_PAGE }, controller.signal)
      .then((res) => {
        setOpenReports(res.reports.length);
        setOpenReportsFullPage(res.reports.length >= REPORTS_PAGE);
        setReportsStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setReportsStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReportsStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <section aria-label="System summary" className="flex flex-col gap-3">
      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading system summary" />
        </div>
      ) : status === "error" || system === null ? (
        <ErrorState message="Could not load the system summary." onRetry={retry} />
      ) : (
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Badge variant={system.status === "degraded" ? "danger" : "success"}>
            {system.status === "degraded" ? "Degraded" : "Healthy"}
          </Badge>
          <span className="font-semibold tracking-tight text-fg">
            {system.software.name} {system.software.version}
          </span>
          <span className="text-[13px] text-fg-muted tabular-nums">
            up {formatUptime(system.uptime_seconds)}
          </span>
          <Link
            href="/admin/system"
            className="focus-ring rounded text-[13px] font-semibold text-fg-muted underline underline-offset-2 transition-colors hover:text-fg"
          >
            Details
          </Link>
        </Card>
      )}

      {reportsStatus === "loading" ? (
        <p className="text-sm text-fg-muted" aria-busy="true">
          Loading open reports…
        </p>
      ) : reportsStatus === "error" ? (
        <p role="alert" className="text-sm text-danger">
          Could not load the open-reports count.{" "}
          <button
            type="button"
            onClick={retry}
            className="focus-ring rounded font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </p>
      ) : (
        <p className="text-sm text-fg">
          {openReports === 0 ? (
            "No open reports."
          ) : (
            <>
              <span className="font-semibold tabular-nums">
                {openReportsFullPage ? `${REPORTS_PAGE}+` : openReports}
              </span>{" "}
              open {openReports === 1 && !openReportsFullPage ? "report" : "reports"}
            </>
          )}{" "}
          <Link
            href="/moderation"
            className="focus-ring rounded font-semibold text-fg-muted underline underline-offset-2 transition-colors hover:text-fg"
          >
            Moderation queue
          </Link>
        </p>
      )}
    </section>
  );
}
