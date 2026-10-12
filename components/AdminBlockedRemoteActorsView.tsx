"use client";

import { useCallback, useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { UserIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { api, errorMessage } from "@/lib/api";
import type { BlockedRemoteActor } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAsyncAction } from "@/lib/use-async-action";
import { usePagedList } from "@/lib/use-paged-list";

const MAX_REASON_LEN = 2000;

// AdminBlockedRemoteActorsView is the moderator/admin ACCOUNT-level federation
// blocklist: block one remote account (handle or actor URL) for every reader on
// this instance without defederating the whole server it lives on. Role-gated
// like AdminInstancesView, so an under-privileged viewer fetches nothing.
export function AdminBlockedRemoteActorsView() {
  return (
    <RoleGate minRole="moderator" action="manage blocked remote accounts">
      <ListBoundary label="blocked remote accounts">
        <ActorsList />
      </ListBoundary>
    </RoleGate>
  );
}

function ActorsList() {
  const list = usePagedList<BlockedRemoteActor>({
    load: (query, signal) =>
      api
        .getBlockedRemoteActors({ limit: query.limit, offset: query.offset }, signal)
        .then((res) => ({
          items: res.actors,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  // The block endpoint answers 204 with no body and the server resolves the
  // handle to an actor URL, so the new row's identity is only known after a
  // reload — refetch rather than invent a row.
  const { reload } = list;
  const onBlocked = useCallback(() => reload(), [reload]);

  return (
    <PagedListShell
      list={list}
      noun="blocked remote account"
      toolbar={<BlockActorForm onBlocked={onBlocked} />}
      errorMessage="Could not load the blocked remote accounts."
      emptyIcon={<UserIcon size={24} />}
      emptyTitle="No blocked remote accounts"
      emptyMessage="Block a single remote account above and it disappears for everyone on this server, without defederating the instance it lives on."
    >
      <ul className="flex flex-col gap-2">
        {list.items.map((actor) => (
          <li key={actor.actor_url}>
            <BlockedActorRow
              actor={actor}
              onUnblocked={(url) => list.drop((a) => a.actor_url !== url)}
            />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

function BlockActorForm({ onBlocked }: { onBlocked: () => void }) {
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");
  const { run, busy, error, clearError } = useAsyncAction(
    async (trimmedActor: string) => {
      await api.blockRemoteActorInstanceWide({
        actor: trimmedActor,
        reason: reason.trim() || undefined,
      });
      setActor("");
      setReason("");
      onBlocked();
    },
    // errorMessage quotes the backend's own sentence (local identity, cannot be
    // resolved, ...), so a 422 says which it was.
    "Could not block this account.",
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-fg-muted">
        Unlike your personal block list, this hides the account across the whole instance: for
        every viewer, including signed-out ones.
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = actor.trim();
          if (trimmed === "" || busy) return;
          void run(trimmed);
        }}
      >
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            aria-label="Remote account to block"
            placeholder="@user@host or actor URL"
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              clearError();
            }}
            className="focus-ring w-full max-w-xs rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
          />
          <input
            type="text"
            aria-label="Reason for blocking (optional)"
            placeholder="Reason (optional, visible to other moderators)"
            maxLength={MAX_REASON_LEN}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
          />
          <Button type="submit" size="sm" disabled={busy || actor.trim() === ""}>
            {busy ? "Blocking…" : "Block"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function BlockedActorRow({
  actor,
  onUnblocked,
}: {
  actor: BlockedRemoteActor;
  onUnblocked: (actorUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A never-cached actor lists with an empty handle: fall back to the URL so
  // the row is still identifiable (and therefore liftable).
  const label = actor.handle || actor.actor_url;

  async function unblock() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.unblockRemoteActorInstanceWide(actor.actor_url);
      onUnblocked(actor.actor_url);
    } catch (err) {
      setError(errorMessage(err, "Could not unblock this account."));
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-fg">{label}</p>
        <p className="text-[13px] text-fg-muted">
          {actor.domain} · blocked {relativeTime(actor.blocked_at)}
        </p>
        {actor.reason ? <p className="mt-1 text-[13px] text-fg-muted">{actor.reason}</p> : null}
        {error ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {confirming ? (
          <>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => void unblock()}>
              {busy ? "Unblocking…" : "Confirm unblock"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Unblock ${label}`}
            onClick={() => setConfirming(true)}
          >
            Unblock
          </Button>
        )}
      </div>
    </div>
  );
}
