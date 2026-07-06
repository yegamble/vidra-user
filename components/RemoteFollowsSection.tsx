"use client";

import { useCallback, useEffect, useState } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { RemoteFollow } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { parseRemoteFollowTarget } from "@/lib/remote-follow";

type Status = "loading" | "error" | "ready";

// RemoteFollowsSection is the federation affordance on /subscriptions (its one
// home — noted in fix_plan): a "Follow a remote channel" form (name@domain or
// actor URL → POST /me/remote-follows) plus the management list of the user's
// remote follows with pending/accepted state badges and Unfollow. Videos from
// accepted follows arrive in the subscriptions feed below as remote cards.
// Rendered only for a signed-in viewer (the page already gates).
export function RemoteFollowsSection() {
  const [status, setStatus] = useState<Status>("loading");
  const [follows, setFollows] = useState<RemoteFollow[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listRemoteFollows({ limit: 100 }, controller.signal)
      .then((res) => {
        setFollows(res.follows);
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

  const onFollowed = useCallback((follow: RemoteFollow) => {
    setFollows((prev) => [follow, ...prev.filter((f) => f.id !== follow.id)]);
  }, []);

  const onUnfollowed = useCallback((id: string) => {
    setFollows((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <section
      aria-labelledby="remote-follows-heading"
      className="mb-8 flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex flex-col gap-1">
        <h2 id="remote-follows-heading" className="text-base font-semibold">
          Remote subscriptions
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
          className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={busy || value.trim() === ""}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Following…" : "Follow"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function StateBadge({ state }: { state: RemoteFollow["state"] }) {
  return state === "accepted" ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-950/50 dark:text-green-300">
      Accepted
    </span>
  ) : (
    <span
      className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
      title="Waiting for the remote instance to accept the follow"
    >
      Pending
    </span>
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {follow.handle}
          </span>
          <StateBadge state={follow.state} />
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {follow.domain} · followed {relativeTime(follow.created_at)}
        </p>
        {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={busy}
        aria-label={`Unfollow ${follow.handle}`}
        onClick={() => void unfollow()}
        className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Unfollow
      </button>
    </div>
  );
}
