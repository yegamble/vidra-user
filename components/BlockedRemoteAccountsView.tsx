"use client";

import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { GlobeIcon } from "@/components/icons";
import { ManagedList, UndoActionRow } from "@/components/ManagedList";
import { SignInGate } from "@/components/SignInGate";
import { Button, EmptyState, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { RemoteBlock } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import { relativeTime } from "@/lib/format";

// BlockedRemoteAccountsView is the viewer surface for A29's per-remote-account
// block. Before it, the only control a viewer had against one person on another
// instance was muting or blocking that instance wholesale — a sledgehammer that
// costs them every creator on that server.
//
// It is a separate list from blocked LOCAL accounts because the identity is
// different in kind: a remote actor is an ActivityPub URL, reached by pasting a
// @user@domain handle or the actor's URL, and it may name someone this instance
// has never cached. That last case is exactly why the row falls back to showing
// the URL — a block the viewer cannot see is a block they cannot lift.
export function BlockedRemoteAccountsView() {
  const { status, user } = useSession();
  const [reloadKey, setReloadKey] = useState(0);

  if (status === "anon" || !user) {
    return (
      <SignInGate title="Sign in to manage blocked remote accounts" lead="Your session has ended.">
        to see the federated accounts you have blocked.
      </SignInGate>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BlockRemoteAccountForm onBlocked={() => setReloadKey((k) => k + 1)} />
      {/*
        REMOUNTED on reloadKey rather than re-fetched through a dependency:
        ManagedList calls useApiResource with no deps, so a new load callback
        alone would never re-run. A key change is the honest way to say "this
        list is now about a different world".
      */}
      <ManagedList<RemoteBlock>
        key={reloadKey}
        load={(signal) =>
          api.getRemoteBlocks({ limit: FULL_LIST_LIMIT }, signal).then((res) => res.actors)
        }
        rowKey={(actor) => actor.actor_url}
        loadingLabel="Loading blocked remote accounts"
        errorText="Could not load your blocked remote accounts."
        empty={
          <EmptyState
            icon={<GlobeIcon size={24} />}
            tint="red"
            title="No blocked remote accounts"
            message="Blocking one federated account hides their videos from you, keeps their replies off your own videos, and refuses their follows — without blocking everyone else on their instance."
          />
        }
        renderRow={(actor, remove) => (
          <UndoActionRow
            title={actor.handle || actor.actor_url}
            subtitle={
              actor.handle
                ? `${actor.actor_url} · blocked ${relativeTime(actor.blocked_at)}`
                : `blocked ${relativeTime(actor.blocked_at)}`
            }
            action="Unblock"
            perform={() => api.unblockRemoteActor(actor.actor_url)}
            failureText="Could not unblock this remote account."
            onDone={remove}
          />
        )}
      />
    </div>
  );
}

// BlockRemoteAccountForm takes the identity a person actually has to hand: a
// fediverse handle they read on a card, or the actor URL they copied. Anything
// else is refused by the backend with a 422 whose message is shown verbatim —
// "that account is local to this instance" is more useful than a generic error.
function BlockRemoteAccountForm({ onBlocked }: { onBlocked: () => void }) {
  const [actor, setActor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = actor.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.blockRemoteActor(value);
      setActor("");
      onBlocked();
    } catch (err) {
      setError(errorMessage(err, "Could not block that remote account."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="remote-block-actor" className="text-[13px] font-semibold text-fg">
        Block a remote account
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="remote-block-actor"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="@name@instance.example"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="primary" size="sm" disabled={busy || actor.trim() === ""}>
          Block
        </Button>
      </div>
      <p className="text-xs text-fg-muted">
        A fediverse handle (@name@instance.example) or the account&rsquo;s ActivityPub URL.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
