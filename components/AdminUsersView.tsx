"use client";

import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { AdminUser, UserRole } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

const ROLES: UserRole[] = ["user", "moderator", "admin"];

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

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitSearch(input.trim());
        }}
      >
        <input
          type="search"
          aria-label="Search users"
          placeholder="Search by username or email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Search
        </button>
        {query ? (
          <button
            type="button"
            onClick={() => {
              setInput("");
              submitSearch("");
            }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Clear
          </button>
        ) : null}
      </form>

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
      ) : (
        <ul className="flex flex-col gap-3">
          {users.map((u) => (
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
    async (patch: { role?: UserRole; is_active?: boolean }) => {
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

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{user.username}</span>
        {isSelf ? (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            you
          </span>
        ) : null}
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            user.email_verified
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {user.email_verified ? "verified" : "unverified"}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          joined {relativeTime(user.created_at)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Role</span>
          <select
            aria-label={`Role for ${user.username}`}
            value={user.role}
            disabled={isSelf || rowState === "saving"}
            onChange={(e) => void save({ role: e.target.value as UserRole })}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            user.is_active
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
          }`}
        >
          {user.is_active ? "active" : "deactivated"}
        </span>
        <button
          type="button"
          aria-label={`${user.is_active ? "Deactivate" : "Reactivate"} ${user.username}`}
          disabled={isSelf || rowState === "saving"}
          onClick={() => void save({ is_active: !user.is_active })}
          className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {user.is_active ? "Deactivate" : "Reactivate"}
        </button>
        {!deleteArmed ? (
          <button
            type="button"
            aria-label={`Delete ${user.username} permanently`}
            disabled={isSelf || rowState === "saving"}
            onClick={() => setDeleteArmed(true)}
            className="rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            Delete permanently
          </button>
        ) : null}
        {isSelf ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            You can&apos;t change your own role or status, or delete your own account.
          </span>
        ) : null}
      </div>

      {deleteArmed ? (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-red-300 p-3 dark:border-red-900/60">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This permanently deletes <span className="font-medium">{user.username}</span>&apos;s
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
              className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="button"
              aria-label={`Confirm permanent deletion of ${user.username}`}
              disabled={rowState === "saving" || deleteConfirmName !== user.username}
              onClick={() => void doDelete()}
              className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60"
            >
              {rowState === "saving" ? "Deleting…" : "Confirm permanent delete"}
            </button>
            <button
              type="button"
              disabled={rowState === "saving"}
              onClick={() => {
                setDeleteArmed(false);
                setDeleteConfirmName("");
                setError(null);
              }}
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </article>
  );
}
