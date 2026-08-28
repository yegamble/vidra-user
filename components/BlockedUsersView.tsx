"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { SlashCircleIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { BlockedUser } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
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
            <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
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
      .getBlockedUsers({ limit: FULL_LIST_LIMIT }, controller.signal)
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
        icon={<SlashCircleIcon size={24} />}
        tint="red"
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
      setError(errorMessage(err, "Could not unblock this account."));
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-fg">
          {account.display_name || account.username}
        </p>
        <p className="text-[13px] text-fg-muted">
          @{account.username} · blocked {relativeTime(account.blocked_at)}
        </p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void unblock()}
        className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong disabled:opacity-60"
      >
        Unblock
      </button>
    </div>
  );
}
