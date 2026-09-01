"use client";

import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { FollowBell } from "@/components/FollowBell";
import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { api } from "@/lib/api";
import type { NotificationSetting } from "@/lib/api";

// FollowButton toggles a follow on a channel for the signed-in user, in the
// Apple-redesign follow affordance: a solid-accent "Follow" when not following,
// a tonal "Following" (with a leading check glyph) once followed. `onDelta`
// nudges a displayed follower count optimistically. Anonymous visitors get a
// sign-in link instead. Shared by the channel page and the watch-page channel row.
//
// Once following, the per-channel notification bell sits beside it (the
// subscribe-then-bell pair every viewer brings from YouTube), SEEDED from the
// `notification_setting` the channel payload already carries — no extra request.
// Both render as flex siblings; every call site places this in a gapped row.
export function FollowButton({
  handle,
  channelName,
  initialFollowing = false,
  initialNotificationSetting = "all",
  onDelta,
  className = "px-5",
}: {
  handle: string;
  /** Display name for the bell's accessible name; falls back to the handle. */
  channelName?: string;
  initialFollowing?: boolean;
  initialNotificationSetting?: NotificationSetting;
  onDelta?: (delta: number) => void;
  className?: string;
}) {
  const { status } = useSession();
  const [following, setFollowing] = useState(initialFollowing);
  const [notification, setNotification] = useState<NotificationSetting>(
    initialNotificationSetting,
  );
  const [busy, setBusy] = useState(false);

  // Sync state if initialFollowing changes from the parent
  // We use standard check during render to update the state to avoid setting state in effect.
  // This approach is documented in the React docs under "You Might Not Need An Effect" -> "Adjusting some state when a prop changes".
  const [prevInitial, setPrevInitial] = useState(initialFollowing);
  if (initialFollowing !== prevInitial) {
    setPrevInitial(initialFollowing);
    setFollowing(initialFollowing);
  }

  if (status !== "authed") {
    return (
      <LinkButton href="/login" variant="tonal" className={className}>
        Sign in to follow
      </LinkButton>
    );
  }

  async function toggle() {
    setBusy(true);
    const next = !following;
    try {
      if (next) {
        await api.followChannel(handle);
        // Core starts every new follow with the bell on; don't show a stale
        // "none" left over from an earlier unfollow in this session.
        setNotification("all");
      } else {
        await api.unfollowChannel(handle);
      }
      setFollowing(next);
      onDelta?.(next ? 1 : -1);
    } catch {
      // Leave the button state unchanged on failure.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={following ? "tonal" : "primary"}
        disabled={busy}
        onClick={() => void toggle()}
        className={className}
      >
        {following ? <CheckIcon size={16} /> : null}
        {following ? "Following" : "Follow"}
      </Button>
      {following ? (
        <FollowBell
          handle={handle}
          channelName={channelName ?? handle}
          setting={notification}
          onChange={setNotification}
          className="shrink-0"
        />
      ) : null}
    </>
  );
}
