"use client";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { ListSearch } from "@/components/admin/ListToolbar";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { RoleGate } from "@/components/RoleGate";
import { api } from "@/lib/api";
import type { AuditLogEntry } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

// AdminAuditLogView is the admin-only security audit trail, role-gated by
// RoleGate (an under-privileged/anonymous viewer sees the shared permission
// prompt and nothing fetches).
export function AdminAuditLogView() {
  return (
    <RoleGate minRole="admin" action="view the audit log">
      <ListBoundary label="audit entries">
        <AuditList />
      </ListBoundary>
    </RoleGate>
  );
}

function AuditList() {
  const list = usePagedList<AuditLogEntry>({
    filterKeys: ["action"],
    load: (query, signal) =>
      api
        .getAuditLog(
          { action: query.filters.action, limit: query.limit, offset: query.offset },
          signal,
        )
        .then((res) => ({
          items: res.entries,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  return (
    <PagedListShell
      list={list}
      noun="audit entry"
      // Was a bespoke bordered <input> + Filter button — the only admin surface
      // with its own search chrome. It is the same control as everywhere else.
      toolbar={
        <ListSearch
          label="Filter by action"
          placeholder="Filter by action (e.g. auth.login)"
          value={list.filters.action ?? ""}
          onSubmit={(next) => list.setFilter("action", next)}
        />
      }
      errorMessage="Could not load the audit log."
      emptyTitle="No audit entries"
      emptyMessage="No security-audit events match this view."
    >
        <ul className="flex flex-col divide-y divide-border-subtle">
          {list.items.map((e) => (
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
    </PagedListShell>
  );
}
