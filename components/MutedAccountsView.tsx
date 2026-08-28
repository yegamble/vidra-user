"use client";

import Link from "next/link";

import { useSession } from "@/components/auth/AuthProvider";
import { EyeOffIcon } from "@/components/icons";
import { ManagedList, UndoActionRow } from "@/components/ManagedList";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import type { MutedAccount } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import { relativeTime } from "@/lib/format";

// MutedAccountsView lists the accounts the signed-in user has muted and lets them
// unmute. The session lives in memory, so a hard reload lands here signed out — we
// show a sign-in prompt rather than fetching a 401.
export function MutedAccountsView() {
  const { status, user } = useSession();

  if (status === "anon" || !user) {
    return (
      <EmptyState
        title="Sign in to manage muted accounts"
        message={
          <>
            Your session has ended.{" "}
            <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
              Sign in
            </Link>{" "}
            to see the accounts you have muted.
          </>
        }
      />
    );
  }

  return (
    <ManagedList<MutedAccount>
      load={(signal) =>
        api.getMutedAccounts({ limit: FULL_LIST_LIMIT }, signal).then((res) => res.accounts)
      }
      rowKey={(account) => account.user_id}
      loadingLabel="Loading muted accounts"
      errorText="Could not load your muted accounts."
      empty={
        <EmptyState
          icon={<EyeOffIcon size={24} />}
          tint="indigo"
          title="No muted accounts"
          message="When you mute an account its comments are hidden from you. Muted accounts appear here."
        />
      }
      renderRow={(account, remove) => (
        <UndoActionRow
          title={account.display_name || account.username}
          subtitle={`@${account.username} · muted ${relativeTime(account.muted_at)}`}
          action="Unmute"
          perform={() => api.unmuteAccount(account.user_id)}
          failureText="Could not unmute this account."
          onDone={remove}
        />
      )}
    />
  );
}
