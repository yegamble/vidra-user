"use client";

import { useMemo } from "react";

import { useSession } from "@/components/auth/AuthProvider";

/**
 * The shape a viewer-scoped client-side read needs from the session, and
 * nothing else.
 */
export interface SettledSession {
  /**
   * False only while the boot-time silent refresh is still in flight. A
   * viewer-scoped effect must not send its request until this is true — see the
   * hook's own docblock for why.
   */
  settled: boolean;
  /** True once the session has settled AND there is a signed-in account. */
  authed: boolean;
  /** The signed-in account's id, or null (anonymous, or not settled yet). */
  viewerId: string | null;
  /**
   * The ONE value to put in a viewer-scoped effect's dependency list. It
   * changes exactly when the answer the server would give changes identity:
   * restoring → anonymous, restoring → this account, this account → another.
   * It deliberately does NOT change when the account's own profile is edited,
   * because that does not change who the server is filtering for.
   */
  viewerKey: string;
}

/**
 * useSettledSession — "don't ask the server a viewer-scoped question until you
 * know who the viewer is, and ask again when the viewer changes."
 *
 * A whole class of defect has been fixed four times in this repo one component
 * at a time (`CommentsSection`, `RatingControls`, `HomeRecommendationsRail`,
 * `RelatedVideos`). The mechanism is always the same. The access token is NOT
 * in the first render: it is redeemed asynchronously from the httpOnly
 * `vidra_refresh` cookie by `AuthProvider`, which reports `status:
 * "restoring"` while that POST is in flight. A read fired from a mount effect
 * therefore leaves WITHOUT an `Authorization` header, and every endpoint behind
 * core's `optionalAuth` answers it as an anonymous visitor: no `my_rating`, no
 * `is_following`, no personalization, and — the one that is a privacy failure
 * rather than a cosmetic one — none of the viewer's own mute and block
 * filtering, because the server cannot filter for a viewer it was not told
 * about. The effect then never re-runs, so a hard reload shows the muted
 * author's comments and their videos in "watch next".
 *
 * The fix is one line at the top of the effect plus one dependency, and this
 * hook is the single seam that spells both:
 *
 * ```ts
 * const { settled, viewerKey } = useSettledSession();
 * useEffect(() => {
 *   if (!settled) return;
 *   // ... the viewer-scoped read
 * }, [videoId, viewerKey]);
 * ```
 *
 * `settled` delays the read rather than skipping it — "restoring" always
 * settles to "authed" or "anon" — and `viewerKey` is what makes the delayed
 * read actually happen, and happen again after a sign-in or a sign-out.
 * Depending on `viewerKey` rather than on the raw `status` also covers the
 * account switch that never passes through "anon".
 *
 * This intentionally goes through `useSession` (which throws outside an
 * `AuthProvider`) rather than `useOptionalSession`: a viewer-scoped read
 * mounted outside the provider can never see the viewer, which is the bug, not
 * a supported configuration. Components that legitimately render bare keep
 * using `useOptionalSession` directly.
 */
export function useSettledSession(): SettledSession {
  const { status, user } = useSession();
  const viewerId = status === "authed" ? (user?.id ?? null) : null;
  return useMemo<SettledSession>(
    () => ({
      settled: status !== "restoring",
      authed: status === "authed",
      viewerId,
      // `authed:` with an empty id still differs from "anon", so a session
      // mocked as `{ status }` alone (the component tests' shape) does not
      // collapse a signed-in viewer onto the anonymous one.
      viewerKey: status === "authed" ? `authed:${viewerId ?? ""}` : status,
    }),
    [status, viewerId],
  );
}
