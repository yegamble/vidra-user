"use client";

import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { api } from "@/lib/api";

// FollowButton toggles a follow on a channel for the signed-in user, in the
// template's follow affordance: an accent-filled "Follow" when not following, an
// outlined "Following" once followed (design-system channel-header / watch-row
// pattern, matching the app's FOLLOWING vocabulary and the follow/unfollow API).
// The public channel endpoint carries no "is following" flag, so the button
// starts at "Follow" and tracks state locally (follow/unfollow are idempotent
// server-side); `onDelta` nudges a displayed follower count optimistically.
// Anonymous visitors get a sign-in link instead. Shared by the channel page and
// the watch-page channel row.
export function FollowButton({
  handle,
  onDelta,
  className = "px-5",
}: {
  handle: string;
  onDelta?: (delta: number) => void;
  className?: string;
}) {
  const { status } = useSession();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status !== "authed") {
    return (
      <LinkButton href="/login" variant="secondary" className={className}>
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
    <Button
      variant={following ? "secondary" : "primary"}
      disabled={busy}
      onClick={() => void toggle()}
      className={className}
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}
