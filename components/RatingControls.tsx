"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ThumbsDownIcon, ThumbsUpIcon } from "@/components/icons";
import { api } from "@/lib/api";
import type { RatingValue, VideoRating } from "@/lib/api";
import { formatCount } from "@/lib/format";

// RatingControls shows a video's like/dislike counts and lets an authenticated
// viewer set, switch, or clear their rating. The server is the source of truth:
// every action replaces local state with the summary the API returns. Clicking
// the rating you already hold clears it (toggle).
export function RatingControls({ videoId }: { videoId: string }) {
  const { status } = useSession();
  const [rating, setRating] = useState<VideoRating | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getVideoRating(videoId, controller.signal)
      .then((r) => setRating(r))
      .catch(() => {
        // Leave rating null on error; the control simply does not render.
      });
    return () => controller.abort();
  }, [videoId]);

  if (rating === null) return null;
  const authed = status === "authed";

  async function choose(value: RatingValue) {
    if (rating === null || !authed || busy) return;
    setBusy(true);
    try {
      const next =
        rating.my_rating === value
          ? await api.clearVideoRating(videoId)
          : await api.setVideoRating(videoId, value);
      setRating(next);
    } catch {
      // Keep the current rating on failure.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <RatingButton
        label="Like"
        count={rating.like_count}
        active={rating.my_rating === "like"}
        disabled={!authed || busy}
        onClick={() => void choose("like")}
      />
      <RatingButton
        label="Dislike"
        count={rating.dislike_count}
        active={rating.my_rating === "dislike"}
        disabled={!authed || busy}
        onClick={() => void choose("dislike")}
      />
      {!authed ? (
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
  active,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={
        "focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 " +
        (active
          ? "bg-accent text-accent-fg hover:bg-accent/90"
          : "bg-surface-muted text-fg hover:bg-surface-strong")
      }
    >
      {label === "Like" ? <ThumbsUpIcon size={16} /> : <ThumbsDownIcon size={16} />}
      <span className="tabular-nums">{formatCount(count)}</span>
    </button>
  );
}
