"use client";

import Link from "next/link";

import { useSession } from "@/components/auth/AuthProvider";
import { SlashCircleIcon } from "@/components/icons";
import { ManagedList, UndoActionRow } from "@/components/ManagedList";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import type { BlockedUser } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import { relativeTime } from "@/lib/format";

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

  return (
    <ManagedList<BlockedUser>
      load={(signal) =>
        api.getBlockedUsers({ limit: FULL_LIST_LIMIT }, signal).then((res) => res.users)
      }
      rowKey={(account) => account.user_id}
      loadingLabel="Loading blocked accounts"
      errorText="Could not load your blocked accounts."
      empty={
        <EmptyState
          icon={<SlashCircleIcon size={24} />}
          tint="red"
          title="No blocked accounts"
          message="When you block an account, neither of you can send the other a direct message. Blocked accounts appear here."
        />
      }
      renderRow={(account, remove) => (
        <UndoActionRow
          title={account.display_name || account.username}
          subtitle={`@${account.username} · blocked ${relativeTime(account.blocked_at)}`}
          action="Unblock"
          perform={() => api.unblockUser(account.user_id)}
          failureText="Could not unblock this account."
          onDone={remove}
        />
      )}
    />
  );
}
