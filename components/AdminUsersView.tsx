"use client";

import { useCallback, useMemo, useState } from "react";

import { AdminPagination, RolePill } from "@/components/admin/AdminControls";
import { ListBoundary } from "@/components/admin/ListBoundary";
import { ListSearch } from "@/components/admin/ListToolbar";
import { useSession } from "@/components/auth/AuthProvider";
import { ChevronLeftIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FilterChipGroup } from "@/components/ui/FilterChips";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { AdminUser, UserRole } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes, formatMonthYear, relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

// Accounts per request. The endpoint pages via limit/offset and the published
// contract caps a page at 100, which is also the page this view has always
// shown. It is now just the DEFAULT: the pager's rows-per-page picker can take
// it down to something an operator can actually read through.
const PAGE_SIZE = 100;

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

type QuotaPatch = { role?: UserRole; is_active?: boolean; storage_quota_bytes?: number | null };

// useUserActions centralises the per-user mutations (role / active / quota PATCH,
// and the hard DELETE) so the mobile card and the desktop detail drive the exact
// same real endpoints without duplicating the request/error handling.
function useUserActions(
  user: AdminUser,
  onUpdated: (updated: AdminUser) => void,
  onDeleted: (id: string) => void,
) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (patch: QuotaPatch) => {
      setSaving(true);
      setError(null);
      try {
        onUpdated(await api.updateAdminUser(user.id, patch));
      } catch (err) {
        setError(errorMessage(err, "Could not update this user."));
      } finally {
        setSaving(false);
      }
    },
    [user.id, onUpdated],
  );

  const doDelete = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await api.deleteAdminUser(user.id);
      onDeleted(user.id);
      // Success unmounts the row/detail — leave `saving` set so nothing flashes.
    } catch (err) {
      setError(errorMessage(err, "Could not delete this user."));
      setSaving(false);
    }
  }, [user.id, onDeleted]);

  return { saving, error, setError, save, doDelete };
}

// AdminUsersView is the admin-only account management surface, role-gated by
// RoleGate (an under-privileged/anonymous viewer sees the shared permission
// prompt and nothing fetches).
export function AdminUsersView() {
  const { user } = useSession();

  return (
    <RoleGate minRole="admin" action="manage users">
      {user ? (
        <ListBoundary label="users">
          <UsersList currentUserId={user.id} />
        </ListBoundary>
      ) : null}
    </RoleGate>
  );
}

function UsersList({ currentUserId }: { currentUserId: string }) {
  // Desktop console (DR12): the users table is a master → detail. `selectedId`
  // is only ever set from the desktop table; mobile keeps its inline-control
  // cards, so it stays null there.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuotaFilter>("all");

  const list = usePagedList<AdminUser>({
    defaultLimit: PAGE_SIZE,
    filterKeys: ["q"],
    load: (query, signal) =>
      api
        .getAdminUsers(
          { q: query.filters.q, limit: query.limit, offset: query.offset },
          signal,
        )
        .then((res) => ({
          items: res.users,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  const { items: users, total, pageLimit, pageOffset, patch, drop } = list;
  const query = list.filters.q ?? "";

  // Reflect a saved edit back into the list (the PATCH returns the updated user).
  const onUpdated = useCallback(
    (updated: AdminUser) => patch((all) => all.map((u) => (u.id === updated.id ? updated : u))),
    [patch],
  );

  // A hard-deleted account is gone for good — drop its row, close its detail,
  // and take it off the total so the pager doesn't keep counting a row that no
  // longer exists anywhere.
  const onDeleted = useCallback(
    (id: string) => {
      drop((u) => u.id !== id);
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [drop],
  );

  // Leaving the current page — by searching, paging, or resizing the page —
  // takes the open detail with it: the account it was showing is no longer in
  // the rows behind it.
  const leavePage = useCallback((run: () => void) => {
    setSelectedId(null);
    run();
  }, []);

  // Facet counts over the loaded page. They cannot be anything else: the list
  // endpoint filters by search text only (no role or status parameter exists),
  // so there is no request that could answer "how many admins does this instance
  // have" — and inventing one from a single page would put a wrong number in
  // front of an operator. They are therefore labelled as page-scoped in the
  // group's accessible name, unconditionally, rather than only once a second
  // page exists.
  const counts = useMemo(
    () => ({
      all: users.length,
      staff: users.filter((u) => u.role !== "user").length,
      deactivated: users.filter((u) => u.is_active === false).length,
    }),
    [users],
  );

  // True when the instance has more accounts than this page holds — the state
  // in which a page-scoped count would otherwise pass for an instance-wide one.
  const paged = total > users.length;

  // A facet that empties a page has not proved the instance has no such
  // accounts — only that this page has none.
  const facetEmptyMessage = paged
    ? "No accounts on this page match this filter. Try another page, or another facet."
    : "No accounts match this filter. Try another facet.";

  const visible = useMemo(() => {
    if (filter === "staff") return users.filter((u) => u.role !== "user");
    if (filter === "deactivated") return users.filter((u) => u.is_active === false);
    return users;
  }, [users, filter]);

  const selected = selectedId ? users.find((u) => u.id === selectedId) ?? null : null;

  const pager = (
    <AdminPagination
      total={total}
      limit={pageLimit}
      offset={pageOffset}
      onOffset={(next) => leavePage(() => list.setOffset(next))}
      onPageSize={(next) => leavePage(() => list.setLimit(next))}
      label="users"
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: always on mobile; on desktop it hides while a user detail is
          open (the detail is its own full screen in the design). */}
      <div className={cn("flex flex-col gap-4", selected && "lg:hidden")}>
        <ListSearch
          label="Search users"
          placeholder="Search by username or email"
          value={query}
          // A new query is a new result set, so it starts at the first page —
          // page 40 of the old one is not a meaningful position in the new one.
          // `setFilter` resets the offset for us.
          onSubmit={(next) => leavePage(() => list.setFilter("q", next))}
        />

        <div className="flex flex-col gap-1.5">
          <FilterChipGroup<QuotaFilter>
            size="sm"
            // The name says "this page" whether or not there IS a second page:
            // the counts are page-scoped by construction, and a label that only
            // admits it sometimes teaches the wrong reading the rest of the time.
            label="Filter this page of users"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "staff", label: "Staff", count: counts.staff },
              { value: "deactivated", label: "Deactivated", count: counts.deactivated },
            ]}
          />
          {/* Only worth spelling out once there is a second page. On an instance
              that fits on one, the page IS the instance and the counts are totals. */}
          {paged ? (
            <p className="px-1 text-[11.5px] leading-relaxed text-fg-muted">
              These counts cover the <span className="tabular-nums">{counts.all}</span> accounts on
              this page, not all <span className="tabular-nums">{total}</span>. The accounts
              endpoint filters by search text only, so role and status narrow one page at a time.
            </p>
          ) : null}
        </div>
      </div>

      {list.status === "loading" ? (
        <div className="flex justify-center py-24">
          <Spinner label="Loading users" />
        </div>
      ) : list.status === "error" ? (
        <ErrorState message="Could not load users." onRetry={list.reload} />
      ) : users.length === 0 ? (
        // An empty page past the first one is not an empty instance — deleting
        // the last account on the last page lands here — so it keeps the pager,
        // or the operator is stranded with no way back.
        <>
          <EmptyState
            title={pageOffset > 0 ? "Nothing on this page" : query ? "No matching users" : "No users yet"}
            message={
              pageOffset > 0
                ? "No accounts sit at this offset any more. Step back a page."
                : query
                  ? "Try a different search term."
                  : "Accounts will appear here as people sign up."
            }
          />
          {pager}
        </>
      ) : (
        <>
          {/* Mobile: the DR11 per-user cards with inline controls. */}
          <ul className="flex flex-col gap-3 lg:hidden">
            {visible.length === 0 ? (
              <li>
                <EmptyState title="No users in this view" message={facetEmptyMessage} />
              </li>
            ) : (
              visible.map((u) => (
                <li key={u.id}>
                  <UserRow
                    user={u}
                    isSelf={u.id === currentUserId}
                    onUpdated={onUpdated}
                    onDeleted={onDeleted}
                  />
                </li>
              ))
            )}
          </ul>

          {/* Desktop console: the design's users table → user detail. */}
          <div className="hidden lg:block" data-testid="admin-users-desktop">
            {selected ? (
              <UserDetail
                user={selected}
                isSelf={selected.id === currentUserId}
                onBack={() => setSelectedId(null)}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
              />
            ) : visible.length === 0 ? (
              <EmptyState title="No users in this view" message={facetEmptyMessage} />
            ) : (
              <UsersTable users={visible} currentUserId={currentUserId} onOpen={setSelectedId} />
            )}
          </div>

          {/* Hidden alongside the toolbar while a desktop detail is open: the
              detail is its own full screen, and paging out from under it would
              leave the open account behind. */}
          <div className={cn(selected && "lg:hidden")}>{pager}</div>
        </>
      )}
    </div>
  );
}

// SelfPill — the "you" marker on the current admin's own row.
function SelfPill() {
  return (
    <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-accent-fg">
      you
    </span>
  );
}

/* ── Desktop table ─────────────────────────────────────────────────────────── */

const TABLE_GRID = "grid-cols-[1.4fr_1fr_110px_130px_120px_90px]";

// UsersTable — the design's account table: a 6-column grid (User / Email / Role
// / Storage / Joined / Status) with uppercase column headers and 0.55-opacity
// deactivated rows. Each row is a button that opens the user detail. Keyboard-
// and screen-reader-reachable (a real button per row).
//
// Deliberately NOT on `AdminTable`, unlike the other admin tables. AdminTable
// renders a real `<table>` whose cells are `<td>`s; this table's whole row is a
// single button (that is the master→detail affordance). Fitting it to the shell
// would mean either a button per cell — six tab stops per account and six
// announcements of the same action — or a `<button>` wrapping `<tr>`, which is
// not valid HTML. The shell earns its keep on the other four tables; contorting
// it for this one caller would cost more than the duplication saves.
function UsersTable({
  users,
  currentUserId,
  onOpen,
}: {
  users: AdminUser[];
  currentUserId: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <div
        className={cn(
          "grid gap-3 border-b border-border-subtle px-3.5 pb-2.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-fg-muted",
          TABLE_GRID,
        )}
      >
        <span>User</span>
        <span>Email</span>
        <span>Role</span>
        <span>Storage</span>
        <span>Joined</span>
        <span>Status</span>
      </div>
      <ul>
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          return (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onOpen(u.id)}
                aria-label={`Open ${u.username}`}
                className={cn(
                  "focus-ring grid w-full items-center gap-3 border-b border-border-subtle px-3.5 py-3 text-left transition-colors hover:bg-surface-muted",
                  TABLE_GRID,
                )}
              >
                {/* The design fades deactivated rows to 0.55 opacity; that drops
                    even fg-muted below the AA contrast gate, so we de-emphasise
                    with a muted name + the explicit "Deactivated" status instead
                    (spec §2/§4 — the AA gate wins over the mockup opacity). */}
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar src={null} name={u.username} className="h-8 w-8 text-[12.5px]" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "truncate text-[13.5px] font-semibold",
                          u.is_active ? "text-fg" : "text-fg-muted",
                        )}
                      >
                        {u.username}
                      </span>
                      {isSelf ? <SelfPill /> : null}
                    </span>
                    <span className="block truncate text-[11.5px] text-fg-muted">@{u.username}</span>
                  </span>
                </span>
                <span className="truncate text-[12.5px] text-fg-muted">{u.email}</span>
                <span>
                  <RolePill role={u.role} />
                </span>
                <span className="text-[12.5px] tabular-nums text-fg-muted">
                  {formatBytes(u.storage_used_bytes ?? 0)}
                </span>
                <span className="text-[12.5px] text-fg-muted">{formatMonthYear(u.created_at)}</span>
                <span
                  className={cn(
                    "text-[12px] font-semibold",
                    u.is_active ? "text-success" : "text-fg-muted",
                  )}
                >
                  {u.is_active ? "Active" : "Deactivated"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Desktop user detail ───────────────────────────────────────────────────── */

// UserDetail — the design's two-column user detail: a 64px identity header with
// the Deactivate / Delete actions top-right, then a Role card + Storage-quota
// card + deletion caveat on the left, and a real-facts list on the right. Every
// fact is drawn straight from the AdminUser contract (no fabricated per-user
// video/report/session counts, which the contract does not expose — spec §5.6).
function UserDetail({
  user,
  isSelf,
  onBack,
  onUpdated,
  onDeleted,
}: {
  user: AdminUser;
  isSelf: boolean;
  onBack: () => void;
  onUpdated: (updated: AdminUser) => void;
  onDeleted: (id: string) => void;
}) {
  const { saving, error, setError, save, doDelete } = useUserActions(user, onUpdated, onDeleted);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const used = user.storage_used_bytes ?? 0;
  const quota = user.storage_quota_bytes ?? null;

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="focus-ring -ml-1 inline-flex w-fit items-center gap-1.5 rounded px-1 py-0.5 text-[13px] font-semibold text-fg-muted transition-colors hover:text-fg"
      >
        <ChevronLeftIcon size={15} strokeWidth={2.2} />
        All users
      </button>

      <div className="flex flex-wrap items-start gap-4">
        <Avatar src={null} name={user.username} className="h-16 w-16 text-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-fg">{user.display_name || user.username}</h2>
            {isSelf ? <SelfPill /> : null}
            <RolePill role={user.role} />
          </div>
          <p className="mt-1 text-[13px] text-fg-muted">
            @{user.username}
            <span aria-hidden> · </span>
            <span className="break-all">{user.email}</span>
            <span aria-hidden> · </span>
            {user.email_verified ? (
              <span className="text-success">verified</span>
            ) : (
              <span>unverified</span>
            )}
            <span aria-hidden> · </span>
            joined {formatMonthYear(user.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              Delete account
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* Left column: role + quota + caveat. */}
        <div className="flex flex-col gap-3.5">
          <div className="rounded-2xl bg-surface-muted p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13.5px] font-semibold text-fg">Role</span>
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
          </div>

          <QuotaCard user={user} used={used} quota={quota} saving={saving} onSave={save} boxed />

          <p className="px-1 text-[11.5px] leading-relaxed text-fg-muted">
            {isSelf
              ? "You can't change your own role or status, or delete your own account."
              : "Deletion is permanent and audited. Deactivating is the reversible alternative — it revokes the account's sessions and hides its content without destroying it."}
          </p>

          {deleteArmed ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-danger-border p-3">
              <p className="text-sm text-fg-muted">
                This permanently deletes{" "}
                <span className="font-semibold text-fg">{user.username}</span>&apos;s account:
                their channels and videos are removed for good, their comments become
                &ldquo;[deleted]&rdquo; tombstones, and this cannot be undone.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  autoComplete="off"
                  aria-label={`Type ${user.username} to confirm deletion`}
                  placeholder={`Type ${user.username} to confirm`}
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  className="focus-ring rounded-xl border border-border bg-surface px-3.5 py-1.5 text-sm text-fg placeholder:text-fg-muted"
                />
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Confirm permanent deletion of ${user.username}`}
                  disabled={saving || confirmName !== user.username}
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
                    setConfirmName("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="px-1 text-sm text-danger">{error}</p> : null}
        </div>

        {/* Right column: real facts only. */}
        <dl className="divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
          <Fact k="Role" v={<RolePill role={user.role} />} />
          <Fact
            k="Status"
            v={
              <span className={user.is_active ? "text-success" : "text-fg-muted"}>
                {user.is_active ? "Active" : "Deactivated"}
              </span>
            }
          />
          <Fact k="Email" v={user.email_verified ? "Verified" : "Unverified"} />
          <Fact k="Joined" v={relativeTime(user.created_at)} />
          <Fact k="Storage used" v={<span className="tabular-nums">{formatBytes(used)}</span>} />
          <Fact
            k="Storage quota"
            v={
              <span className="tabular-nums">
                {quota === null ? "Instance default" : quota === 0 ? "Unlimited" : formatBytes(quota)}
              </span>
            }
          />
          <Fact k="New-upload quarantine" v={user.bypass_quarantine ? "Exempt" : "Standard"} />
        </dl>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-[13.5px] first:pt-3">
      <dt className="text-fg-muted">{k}</dt>
      <dd className="font-semibold text-fg">{v}</dd>
    </div>
  );
}

/* ── Mobile card (DR11) ────────────────────────────────────────────────────── */

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
  const { saving, error, setError, save, doDelete } = useUserActions(user, onUpdated, onDeleted);
  // Two-step permanent delete: an explicit arm click, then a type-the-username
  // confirmation (the same double-confirm as the self-serve delete).
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

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
            {isSelf ? <SelfPill /> : null}
            <RolePill role={user.role} />
            {user.is_active ? null : (
              <span className="inline-flex items-center rounded-full bg-danger-surface px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-danger">
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
// unlimited, null = reset to the instance default). `boxed` gives it the
// standalone card fill used on the desktop detail (vs the inset border on the
// mobile card, where it already sits inside a surface-muted card).
function QuotaCard({
  user,
  used,
  quota,
  saving,
  onSave,
  boxed = false,
}: {
  user: AdminUser;
  used: number;
  quota: number | null;
  saving: boolean;
  onSave: (patch: { storage_quota_bytes: number | null }) => Promise<void>;
  boxed?: boolean;
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
    <div
      className={cn(
        boxed
          ? "rounded-2xl bg-surface-muted p-4"
          : "mt-3 rounded-xl border border-border-subtle p-3",
      )}
    >
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="font-semibold text-fg">Storage quota</span>
        <span className="tabular-nums text-fg-muted">
          {rightLabel}
          {overridden ? <span className="text-fg-muted"> · override</span> : null}
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
              className="focus-ring w-24 rounded-lg border border-border bg-surface px-2.5 py-1 text-sm tabular-nums text-fg"
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
