"use client";

import { useCallback, useState } from "react";

import { Avatar, Badge, Button, ErrorState, Spinner } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { RemoteFollow } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import { relativeTime } from "@/lib/format";
import { parseRemoteFollowTarget } from "@/lib/remote-follow";
import { useApiResource } from "@/lib/use-api-resource";

// RemoteFollowsSection is the federation affordance on /subscriptions (its one
// home — noted in fix_plan): a "Follow a remote channel" form (name@domain or
// actor URL → POST /me/remote-follows) plus the management list of the user's
// remote follows with pending/accepted state badges and Unfollow. Videos from
// accepted follows arrive in the subscriptions feed below as remote cards.
// Rendered only for a signed-in viewer (the page already gates).
export function RemoteFollowsSection() {
  const { status, data, retry, setData } = useApiResource<RemoteFollow[]>((signal) =>
    api.listRemoteFollows({ limit: FULL_LIST_LIMIT }, signal).then((res) => res.follows),
  );
  const follows = data ?? [];

  const onFollowed = useCallback(
    (follow: RemoteFollow) =>
      setData((prev) => [follow, ...(prev ?? []).filter((f) => f.id !== follow.id)]),
    [setData],
  );

  const onUnfollowed = useCallback(
    (id: string) => setData((prev) => (prev ?? []).filter((f) => f.id !== id)),
    [setData],
  );

  return (
    <section
      aria-labelledby="remote-follows-heading"
      className="mb-8 flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="remote-follows-heading" className="text-[15px] font-bold tracking-tight">
          Remote subscriptions
        </h2>
        <p className="text-[13px] text-fg-muted">
          Follow channels on other federated instances. New videos from accepted follows appear
          in this feed.
        </p>
      </div>
      <FollowRemoteForm onFollowed={onFollowed} />
      {status === "loading" ? (
        <div className="flex justify-center py-6">
          <Spinner label="Loading remote follows" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load your remote follows." onRetry={retry} />
      ) : follows.length === 0 ? (
        <p className="text-sm text-fg-muted">
          You don&rsquo;t follow any remote channels yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {follows.map((follow) => (
            <li key={follow.id}>
              <RemoteFollowRow follow={follow} onUnfollowed={onUnfollowed} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FollowRemoteForm({ onFollowed }: { onFollowed: (follow: RemoteFollow) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    const target = parseRemoteFollowTarget(value);
    if (!target) {
      setError("Enter a name@domain handle or a channel URL.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const follow = await api.createRemoteFollow(target);
      onFollowed(follow);
      setValue("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError("Federation is disabled on this instance.");
      } else if (err instanceof ApiError && err.status === 422) {
        setError("That channel could not be found. Check the handle or URL and try again.");
      } else {
        setError(errorMessage(err, "Could not follow this channel."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          aria-label="Follow a remote channel"
          placeholder="name@domain or channel URL"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Button type="submit" disabled={busy || value.trim() === ""}>
          {busy ? "Following…" : "Follow"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function StateBadge({ state }: { state: RemoteFollow["state"] }) {
  return state === "accepted" ? (
    <Badge variant="success">Accepted</Badge>
  ) : (
    <Badge variant="warning" title="Waiting for the remote instance to accept the follow">
      Pending
    </Badge>
  );
}

function RemoteFollowRow({
  follow,
  onUnfollowed,
}: {
  follow: RemoteFollow;
  onUnfollowed: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unfollow() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteRemoteFollow(follow.id);
      onUnfollowed(follow.id);
    } catch (err) {
      setError(errorMessage(err, "Could not unfollow this channel."));
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-muted p-3">
      <Avatar src={null} name={follow.handle} className="h-10 w-10 text-sm" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg">{follow.handle}</span>
          <StateBadge state={follow.state} />
        </p>
        <p className="text-xs text-fg-muted">
          {follow.domain} · followed {relativeTime(follow.created_at)}
        </p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        aria-label={`Unfollow ${follow.handle}`}
        onClick={() => void unfollow()}
        className="shrink-0"
      >
        Unfollow
      </Button>
    </div>
  );
}
