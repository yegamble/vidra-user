"use client";

import Link from "next/link";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { ListSearch } from "@/components/admin/ListToolbar";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { RoleGate } from "@/components/RoleGate";
import { api } from "@/lib/api";
import type { AuditLogEntry } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

// MAX_VALUE_CHARS bounds one rendered before/after value. The server already
// caps stored values, but a long one would still push the row off a phone, so
// the row shows a prefix and the full text rides in a title attribute.
const MAX_VALUE_CHARS = 60;

function ChangeValue({ value }: { value: string | undefined }) {
  // The envelope omits an empty side (before is absent on a first write), so
  // "" means "had no value" — said as such instead of printing nothing.
  if (!value) return <span className="text-fg-muted italic">(not set)</span>;
  const clipped = value.length > MAX_VALUE_CHARS;
  return (
    <span className="font-semibold text-fg" title={clipped ? value : undefined}>
      {clipped ? `${value.slice(0, MAX_VALUE_CHARS)}…` : value}
    </span>
  );
}

// ChangeLine renders one safe before/after difference. A change with NEITHER
// side is the server's redacted form (secret / free-text settings: "this
// changed", values deliberately withheld), so it reads "changed" and never a
// guessed value.
function ChangeLine({ change }: { change: NonNullable<AuditLogEntry["changes"]>[number] }) {
  const redacted = !change.before && !change.after;
  return (
    <li className="min-w-0 break-words">
      <code className="font-mono text-xs text-fg">{change.field}</code>:{" "}
      {redacted ? (
        <span className="text-fg-muted">changed</span>
      ) : (
        <>
          <ChangeValue value={change.before} /> → <ChangeValue value={change.after} />
        </>
      )}
    </li>
  );
}

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
                <span className="text-xs text-fg-muted">
                  <time dateTime={e.occurred_at} title={e.occurred_at}>
                    {formatDateTime(e.occurred_at)}
                  </time>
                  {" · "}
                  {relativeTime(e.occurred_at)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 text-[13px] text-fg-muted">
                <span>
                  Actor:{" "}
                  <span className="font-medium text-fg">
                    {e.actor_username || e.actor_id || "—"}
                  </span>
                </span>
                {e.reason ? <span>Reason: {e.reason}</span> : null}
                {e.resource_type || e.resource_id ? (
                  // Only a video has a route keyed by the id the audit row
                  // carries (the user page is keyed by username), so every other
                  // type stays plain text rather than a guessed href.
                  <span className="min-w-0 break-all">
                    Target: {e.resource_type}{" "}
                    {e.resource_type === "video" && e.resource_id ? (
                      <Link
                        href={`/videos/${encodeURIComponent(e.resource_id)}`}
                        className="focus-ring rounded font-medium text-fg underline underline-offset-2"
                      >
                        {e.resource_id}
                      </Link>
                    ) : (
                      e.resource_id
                    )}
                  </span>
                ) : null}
              </div>
              {e.changes && e.changes.length > 0 ? (
                <ul aria-label="Changes" className="flex flex-col gap-0.5 text-[13px] text-fg-muted">
                  {e.changes.map((c) => (
                    <ChangeLine key={c.field} change={c} />
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
    </PagedListShell>
  );
}
