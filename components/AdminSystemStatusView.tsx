"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { SystemStatus } from "@/lib/api";
import { formatUptime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// AdminSystemStatusView is the admin-only operational dashboard: build info, the
// runtime environment, uptime, and per-dependency health. Read-only; a non-admin
// or anonymous viewer is gated out (the session lives in memory, so a hard reload
// lands here signed out — we show a prompt rather than fetching a 403).
export function AdminSystemStatusView() {
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
            with an admin account to view system status.
          </>
        }
      />
    );
  }

  return <StatusPanel />;
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
              ? "rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400"
              : "rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
          }
        >
          {data.status === "degraded" ? "Degraded" : "Healthy"}
        </span>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
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
        <h2 className="mb-2 text-base font-semibold tracking-tight">Dependencies</h2>
        {componentNames.length === 0 ? (
          <EmptyState title="No components" message="No dependencies are being tracked." />
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {componentNames.map((name) => {
              const c = data.components[name];
              const down = c.status !== "ok" && c.status !== "not_configured";
              return (
                <li key={name} className="flex items-center justify-between gap-3 py-2">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{name}</span>
                  <span
                    className={
                      down
                        ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400"
                        : c.status === "not_configured"
                          ? "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                    }
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
    <div className="flex justify-between gap-3 border-b border-zinc-100 py-1 dark:border-zinc-900">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className={mono ? "font-mono text-zinc-800 dark:text-zinc-200" : "text-zinc-800 dark:text-zinc-200"}>
        {value || "—"}
      </dd>
    </div>
  );
}
