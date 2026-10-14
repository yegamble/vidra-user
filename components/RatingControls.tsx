"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { useT } from "@/components/I18nProvider";
import { useWatchSignIn } from "@/components/watch/WatchSignInPrompt";
import { ThumbsDownIcon, ThumbsUpIcon } from "@/components/icons";
import { api } from "@/lib/api";
import type { RatingValue } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { useSettledSession } from "@/lib/use-settled-session";

// What the control renders. Counts are optional: a federated video's counts
// belong to its origin instance and are not reported here, so that adapter
// returns only `my_rating` and the buttons show no number.
export interface RatingState {
  like_count?: number;
  dislike_count?: number;
  my_rating: RatingValue | null;
}

// RatingAdapter is the seam between the control and one rating endpoint
// family. The default talks to local videos; RemoteWatchView passes the
// remote-videos one. `readNeedsAuth` marks a read that is the caller's own vote
// (no public counts), so an anonymous viewer gets the empty control rather
// than a 401.
export interface RatingAdapter {
  get: (id: string, signal?: AbortSignal) => Promise<RatingState>;
  set: (id: string, value: RatingValue) => Promise<RatingState>;
  clear: (id: string) => Promise<RatingState>;
  readNeedsAuth?: boolean;
}

const localAdapter: RatingAdapter = {
  get: (id, signal) => api.getVideoRating(id, signal),
  set: (id, value) => api.setVideoRating(id, value),
  clear: (id) => api.clearVideoRating(id),
};

export const remoteRatingAdapter: RatingAdapter = {
  get: (id, signal) => api.getRemoteVideoRating(id, signal),
  set: (id, value) => api.setRemoteVideoRating(id, value),
  clear: (id) => api.clearRemoteVideoRating(id),
  readNeedsAuth: true,
};

// RatingControls shows a video's like/dislike counts and lets an authenticated
// viewer set, switch, or clear their rating. The server is the source of truth:
// every action replaces local state with the summary the API returns. Clicking
// the rating you already hold clears it (toggle).
export function RatingControls({
  videoId,
  adapter = localAdapter,
}: {
  videoId: string;
  adapter?: RatingAdapter;
}) {
  const t = useT();
  const { status } = useSession();
  const requestSignIn = useWatchSignIn();
  const { settled, viewerKey } = useSettledSession();
  const [fetched, setRating] = useState<RatingState | null>(null);
  const [busy, setBusy] = useState(false);
  // 503 = federation is off on this instance (the control cannot work, say so);
  // 429 = per-user rate limit (transient, say so inline). Both come from the
  // remote endpoints; duck-typed on `status` so this stays adapter-agnostic.
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // An own-vote-only read has nothing to say to an anonymous viewer (and would
  // 401), so the control renders empty instead of asking.
  const skipRead = settled && !!adapter.readNeedsAuth && viewerKey === "anon";
  useEffect(() => {
    // Wait for the session restore to settle. `my_rating` is PER VIEWER and is
    // resolved by the server from the request's bearer token, but the token is
    // restored asynchronously from the refresh cookie — so firing on mount sent
    // the read ANONYMOUSLY and the server answered `my_rating: null`. On every
    // hard reload of the watch page the viewer's own like rendered unpressed,
    // as if they had never rated, and the effect never re-ran to correct it.
    // "restoring" always settles to "authed" or "anon", so this delays the read
    // rather than skipping it (the control renders nothing until it lands).
    // `useSettledSession` is the shared seam for that wait — see its docblock.
    if (!settled) return;
    if (skipRead) return;
    const controller = new AbortController();
    adapter
      .get(videoId, controller.signal)
      .then((r) => setRating(r))
      .catch(() => {
        // Leave rating null on error; the control simply does not render.
      });
    return () => controller.abort();
  }, [videoId, settled, viewerKey, adapter, skipRead]);

  const rating = skipRead ? { my_rating: null } : fetched;
  if (rating === null) return null;
  const authed = status === "authed";

  async function choose(value: RatingValue) {
    if (rating === null || busy || !settled) return;
    if (!authed) { requestSignIn?.(`${value} this video`); return; }
    setBusy(true);
    setNotice(null);
    try {
      const next =
        rating.my_rating === value
          ? await adapter.clear(videoId)
          : await adapter.set(videoId, value);
      setRating(next);
    } catch (err) {
      // Keep the current rating on failure.
      const code = (err as { status?: unknown } | null)?.status;
      if (code === 503) setUnavailable(true);
      else if (code === 429) setNotice(t("watch.rating.rateLimited"));
    } finally {
      setBusy(false);
    }
  }

  const unavailableTip = unavailable ? t("watch.rating.federationOff") : undefined;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Joined like/dislike capsule (YouTube's segmented pill): one tonal
          surface, a hairline divider, per-segment active fill. */}
      <div className="flex shrink-0 items-stretch overflow-hidden rounded-full bg-surface-muted">
        <RatingButton
          label="Like"
          count={rating.like_count}
          title={unavailableTip}
          active={rating.my_rating === "like"}
          disabled={!settled || busy || unavailable || (!authed && !requestSignIn)}
          onClick={() => void choose("like")}
        />
        <span aria-hidden className="my-1.5 w-px shrink-0 bg-border" />
        <RatingButton
          label="Dislike"
          count={rating.dislike_count}
          title={unavailableTip}
          active={rating.my_rating === "dislike"}
          disabled={!settled || busy || unavailable || (!authed && !requestSignIn)}
          onClick={() => void choose("dislike")}
        />
      </div>
      {unavailable ? (
        <span role="status" className="text-xs text-fg-muted">
          {unavailableTip}
        </span>
      ) : null}
      {notice ? (
        <span role="alert" className="text-xs text-danger">
          {notice}
        </span>
      ) : null}
      {!authed && !requestSignIn ? (
        <Link
          href="/login"
          className="focus-ring shrink-0 whitespace-nowrap rounded text-[13px] font-semibold text-fg-muted underline transition-colors hover:text-fg"
        >
          Sign in to rate
        </Link>
      ) : null}
    </div>
  );
}

function RatingButton({
  label,
  count,
  title,
  active,
  disabled,
  onClick,
}: {
  label: string;
  count: number | undefined;
  title?: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={
        "focus-ring flex min-h-11 min-w-11 shrink-0 items-center gap-1.5 whitespace-nowrap py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 " +
        (label === "Like" ? "pl-4 pr-3.5 " : "pl-3.5 pr-4 ") +
        (active ? "bg-accent text-accent-fg hover:bg-accent/90" : "text-fg hover:bg-surface-strong")
      }
    >
      {label === "Like" ? <ThumbsUpIcon size={16} /> : <ThumbsDownIcon size={16} />}
      {count === undefined ? null : <span className="tabular-nums">{formatCount(count)}</span>}
    </button>
  );
}
