"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { BlockedUser } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// BlockedUsersView lists the accounts the signed-in user has blocked and lets
// them unblock. The session lives in memory, so a hard reload lands here signed
// out — we show a sign-in prompt rather than fetching a 401.
export function BlockedUsersView() {
  const { status, user } = useSession();

  if (status === "anon" || !user) {
    return (
      <EmptyState
        title="Sign in to manage blocked accounts"
        message={
          <>
            Your session has ended.{" "}
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Sign in
            </Link>{" "}
            to see the accounts you have blocked.
          </>
        }
      />
    );
  }

  return <BlockList />;
}

function BlockList() {
  const [status, setStatus] = useState<Status>("loading");
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getBlockedUsers({ limit: 100 }, controller.signal)
      .then((res) => {
        setUsers(res.users);
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  const onUnblocked = useCallback((id: string) => {
    setUsers((prev) => prev.filter((u) => u.user_id !== id));
  }, []);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading blocked accounts" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load your blocked accounts." onRetry={retry} />;
  }
  if (users.length === 0) {
    return (
      <EmptyState
        title="No blocked accounts"
        message="When you block an account, neither of you can send the other a direct message. Blocked accounts appear here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {users.map((account) => (
        <li key={account.user_id}>
          <BlockedRow account={account} onUnblocked={onUnblocked} />
        </li>
      ))}
    </ul>
  );
}

function BlockedRow({
  account,
  onUnblocked,
}: {
  account: BlockedUser;
  onUnblocked: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unblock() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.unblockUser(account.user_id);
      onUnblocked(account.user_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not unblock this account.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {account.display_name || account.username}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          @{account.username} · blocked {relativeTime(account.blocked_at)}
        </p>
        {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void unblock()}
        className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Unblock
      </button>
    </div>
  );
}
