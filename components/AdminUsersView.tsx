"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminSearch, RolePill } from "@/components/admin/AdminControls";
import { useSession } from "@/components/auth/AuthProvider";
import { RoleGate } from "@/components/RoleGate";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { AdminUser, UserRole } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes, relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// The design's role control is a three-way segmented switch (was a <select>).
const ROLE_OPTIONS: readonly { value: UserRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "moderator", label: "Moderator" },
  { value: "admin", label: "Admin" },
];

// One GiB in bytes — the quota override is entered in GB (base-2, matching
// formatBytes' "GB" unit) and stored as an exact byte count.
const GIB = 1024 ** 3;

type QuotaFilter = "all" | "staff" | "deactivated";

// AdminUsersView is the admin-only account management surface, role-gated by
// RoleGate (an under-privileged/anonymous viewer sees the shared permission
// prompt and nothing fetches).
export function AdminUsersView() {
  const { user } = useSession();

  return (
    <RoleGate minRole="admin" action="manage users">
      {user ? <UsersList currentUserId={user.id} /> : null}
    </RoleGate>
  );
}

function UsersList({ currentUserId }: { currentUserId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<QuotaFilter>("all");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getAdminUsers({ q: query || undefined, limit: 100 }, controller.signal)
      .then((res) => {
        setUsers(res.users);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [query, reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  // Submit the search (re-triggers the fetch effect). Set loading here rather than
  // in the effect body so a stale list doesn't flash before the refetch resolves.
  const submitSearch = useCallback(
    (next: string) => {
      if (next === query) return;
      setStatus("loading");
      setQuery(next);
    },
    [query],
  );

  // Reflect a saved edit back into the list (the PATCH returns the updated user).
  const onUpdated = useCallback((updated: AdminUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }, []);

  // A hard-deleted account is gone for good — drop its row.
  const onDeleted = useCallback((id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }, []);

  // Client-side facet counts over the loaded page (the list endpoint has no
  // role/status filter param — these narrow the current results honestly).
  const counts = useMemo(
    () => ({
      all: users.length,
      staff: users.filter((u) => u.role !== "user").length,
      deactivated: users.filter((u) => u.is_active === false).length,
    }),
    [users],
  );

  const visible = useMemo(() => {
    if (filter === "staff") return users.filter((u) => u.role !== "user");
    if (filter === "deactivated") return users.filter((u) => u.is_active === false);
    return users;
  }, [users, filter]);

  return (
    <div className="flex flex-col gap-4">
      <AdminSearch
        label="Search users"
        placeholder="Search by username or email"
        value={input}
        onChange={setInput}
        onSubmit={() => submitSearch(input.trim())}
        onClear={() => {
          setInput("");
          submitSearch("");
        }}
        hasQuery={Boolean(query)}
      />

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter users">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All <span className="tabular-nums">· {counts.all}</span>
        </FilterChip>
        <FilterChip active={filter === "staff"} onClick={() => setFilter("staff")}>
          Staff <span className="tabular-nums">· {counts.staff}</span>
        </FilterChip>
        <FilterChip active={filter === "deactivated"} onClick={() => setFilter("deactivated")}>
          Deactivated <span className="tabular-nums">· {counts.deactivated}</span>
        </FilterChip>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-24">
          <Spinner label="Loading users" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load users." onRetry={retry} />
      ) : users.length === 0 ? (
        <EmptyState
          title={query ? "No matching users" : "No users yet"}
          message={query ? "Try a different search term." : "Accounts will appear here as people sign up."}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No users in this view"
          message="No accounts match this filter. Try another facet."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((u) => (
            <li key={u.id}>
              <UserRow
                user={u}
                isSelf={u.id === currentUserId}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// FilterChip — the design's Users facet pill (active = accent-filled, inactive =
// outlined). Single-select; `aria-pressed` carries the state to assistive tech.
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "focus-ring rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
        active
          ? "bg-accent text-accent-fg"
          : "border border-border text-fg-muted hover:bg-surface-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

type RowState = "idle" | "saving";

function UserRow({
  user,
  isSelf,
  onUpdated,
  onDeleted,
}: {
  user: AdminUser;
  isSelf: boolean;
  onUpdated: (updated: AdminUser) => void;
  onDeleted: (id: string) => void;
}) {
  const [rowState, setRowState] = useState<RowState>("idle");
  const [error, setError] = useState<string | null>(null);
  // Two-step permanent delete: an explicit arm click, then a type-the-username
  // confirmation (the same double-confirm as the self-serve delete).
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const save = useCallback(
    async (patch: { role?: UserRole; is_active?: boolean; storage_quota_bytes?: number | null }) => {
      setRowState("saving");
      setError(null);
      try {
        const updated = await api.updateAdminUser(user.id, patch);
        onUpdated(updated);
      } catch (err) {
        setError(errorMessage(err, "Could not update this user."));
      } finally {
        setRowState("idle");
      }
    },
    [user.id, onUpdated],
  );

  const doDelete = useCallback(async () => {
    setRowState("saving");
    setError(null);
    try {
      await api.deleteAdminUser(user.id);
      onDeleted(user.id);
    } catch (err) {
      setError(errorMessage(err, "Could not delete this user."));
      setRowState("idle");
    }
  }, [user.id, onDeleted]);

  const saving = rowState === "saving";
  // storage_used_bytes/storage_quota_bytes are required in the contract; guard
  // for lean fixtures so a partial mock never crashes the row.
  const used = user.storage_used_bytes ?? 0;
  const quota = user.storage_quota_bytes ?? null;

  return (
    <article className="rounded-2xl bg-surface-muted p-4">
      <div className="flex items-start gap-3">
        <Avatar src={null} name={user.username} className="h-11 w-11 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold tracking-tight text-fg">{user.username}</span>
            {isSelf ? (
              <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold tracking-[0.04em] text-accent-fg uppercase">
                you
              </span>
            ) : null}
            <RolePill role={user.role} />
            {user.is_active ? null : (
              <span className="inline-flex items-center rounded-full bg-danger-surface px-2 py-0.5 text-[10.5px] font-bold tracking-[0.04em] text-danger uppercase">
                deactivated
              </span>
            )}
          </div>
          <div className="mt-1 text-[12.5px] text-fg-muted">
            <span className="break-all">{user.email}</span>
            <span aria-hidden> · </span>
            <span>joined {relativeTime(user.created_at)}</span>
            <span aria-hidden> · </span>
            <span className="tabular-nums">{formatBytes(used)}</span>
            <span aria-hidden> · </span>
            <span>{user.email_verified ? "verified" : "unverified"}</span>
          </div>
        </div>
      </div>

      {/* Role — the design's three-way segmented switch. Self is display-only
          (the backend forbids self-demote), so the own row shows a static pill. */}
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-fg">Role</span>
        {isSelf ? (
          <RolePill role={user.role} />
        ) : (
          <SegmentedControl
            size="sm"
            label={`Role for ${user.username}`}
            options={ROLE_OPTIONS}
            value={user.role}
            disabled={saving}
            onChange={(role) => void save({ role })}
          />
        )}
      </div>

      <QuotaCard user={user} used={used} quota={quota} saving={saving} onSave={save} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="tonal"
          size="sm"
          aria-label={`${user.is_active ? "Deactivate" : "Reactivate"} ${user.username}`}
          disabled={isSelf || saving}
          onClick={() => void save({ is_active: !user.is_active })}
        >
          {user.is_active ? "Deactivate" : "Reactivate"}
        </Button>
        {!deleteArmed ? (
          <Button
            variant="danger-outline"
            size="sm"
            aria-label={`Delete ${user.username} permanently`}
            disabled={isSelf || saving}
            onClick={() => setDeleteArmed(true)}
          >
            Delete permanently
          </Button>
        ) : null}
        {isSelf ? (
          <span className="text-xs text-fg-muted">
            You can&apos;t change your own role or status, or delete your own account.
          </span>
        ) : null}
      </div>

      {deleteArmed ? (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-danger-border p-3">
          <p className="text-sm text-fg-muted">
            This permanently deletes <span className="font-semibold text-fg">{user.username}</span>&apos;s
            account: their channels and videos are removed for good, their comments become
            &ldquo;[deleted]&rdquo; tombstones, and this cannot be undone. Deactivate is the
            reversible alternative.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              autoComplete="off"
              aria-label={`Type ${user.username} to confirm deletion`}
              placeholder={`Type ${user.username} to confirm`}
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              className="focus-ring rounded-xl border border-border bg-surface px-3.5 py-1.5 text-sm text-fg placeholder:text-fg-muted"
            />
            <Button
              variant="danger"
              size="sm"
              aria-label={`Confirm permanent deletion of ${user.username}`}
              disabled={saving || deleteConfirmName !== user.username}
              onClick={() => void doDelete()}
            >
              {saving ? "Deleting…" : "Confirm permanent delete"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => {
                setDeleteArmed(false);
                setDeleteConfirmName("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </article>
  );
}

// QuotaCard — the design's storage-quota override: usage line, a progress bar
// (only when a finite override is set), and Change / Reset controls wired to the
// tri-state PATCH storage_quota_bytes (a byte count = per-user override, 0 =
// unlimited, null = reset to the instance default).
function QuotaCard({
  user,
  used,
  quota,
  saving,
  onSave,
}: {
  user: AdminUser;
  used: number;
  quota: number | null;
  saving: boolean;
  onSave: (patch: { storage_quota_bytes: number | null }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [gb, setGb] = useState("");

  const overridden = quota !== null;
  const unlimited = quota === 0;
  const finite = quota !== null && quota > 0;
  const pct = finite ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  const rightLabel = !overridden
    ? `${formatBytes(used)} · instance default`
    : unlimited
      ? `${formatBytes(used)} · unlimited`
      : `${formatBytes(used)} of ${formatBytes(quota)}`;

  const submit = useCallback(async () => {
    const value = Number(gb);
    if (!Number.isFinite(value) || value < 0) return;
    await onSave({ storage_quota_bytes: Math.round(value * GIB) });
    setEditing(false);
    setGb("");
  }, [gb, onSave]);

  return (
    <div className="mt-3 rounded-xl border border-border-subtle p-3">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="font-semibold text-fg">Storage quota</span>
        <span className="text-fg-muted tabular-nums">
          {rightLabel}
          {overridden ? <span className="text-fg-subtle"> · override</span> : null}
        </span>
      </div>
      {finite ? (
        <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-surface-strong">
          <div className="h-full rounded-full bg-fg" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {editing ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[13px] text-fg-muted">
            <input
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
              aria-label={`Storage quota in GB for ${user.username}`}
              value={gb}
              onChange={(e) => setGb(e.target.value)}
              className="focus-ring w-24 rounded-lg border border-border bg-surface px-2.5 py-1 text-sm text-fg tabular-nums"
            />
            GB
          </label>
          <Button
            variant="primary"
            size="sm"
            aria-label={`Save storage quota for ${user.username}`}
            disabled={saving || gb.trim() === ""}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setGb("");
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            variant="tonal"
            size="sm"
            aria-label={`Change storage quota for ${user.username}`}
            disabled={saving}
            onClick={() => {
              setEditing(true);
              setGb(finite ? String(Math.round((quota / GIB) * 10) / 10) : "");
            }}
          >
            Change quota
          </Button>
          {overridden ? (
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Reset ${user.username} to the instance default quota`}
              disabled={saving}
              onClick={() => void onSave({ storage_quota_bytes: null })}
            >
              Reset to default
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
