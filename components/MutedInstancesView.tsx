"use client";

import Link from "next/link";

import { useSession } from "@/components/auth/AuthProvider";
import { ServerIcon } from "@/components/icons";
import { ManagedList, UndoActionRow } from "@/components/ManagedList";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import type { MutedInstance } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import { relativeTime } from "@/lib/format";

// MutedInstancesView lists the federated instances the signed-in user has muted
// (their videos/comments are hidden from the user's feeds and search) and lets
// them unmute. Muting happens from a remote video's watch page ("Mute
// instance"); this is the management surface. The session lives in memory, so
// a hard reload lands here signed out — we show a sign-in prompt rather than
// fetching a 401.
export function MutedInstancesView() {
  const { status, user } = useSession();

  if (status === "anon" || !user) {
    return (
      <EmptyState
        title="Sign in to manage muted instances"
        message={
          <>
            Your session has ended.{" "}
            <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
              Sign in
            </Link>{" "}
            to see the instances you have muted.
          </>
        }
      />
    );
  }

  return (
    <ManagedList<MutedInstance>
      load={(signal) =>
        api.getMutedInstances({ limit: FULL_LIST_LIMIT }, signal).then((res) => res.instances)
      }
      rowKey={(instance) => instance.domain}
      loadingLabel="Loading muted instances"
      errorText="Could not load your muted instances."
      empty={
        <EmptyState
          icon={<ServerIcon size={24} />}
          tint="indigo"
          title="No muted instances"
          message="Mute a federated instance from one of its videos and it will appear here. Content from muted instances is hidden from you."
        />
      }
      renderRow={(instance, remove) => (
        <UndoActionRow
          title={instance.domain}
          subtitle={`muted ${relativeTime(instance.muted_at)}`}
          action="Unmute"
          // A column of identical "Unmute" buttons reads as nothing without it.
          actionLabel={`Unmute ${instance.domain}`}
          perform={() => api.unmuteInstance(instance.domain)}
          failureText="Could not unmute this instance."
          onDone={remove}
        />
      )}
    />
  );
}
