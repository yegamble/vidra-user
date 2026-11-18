"use client";

import { SignInGate } from "@/components/SignInGate";
import { useT } from "@/components/I18nProvider";
import { useSensitiveSignInWall } from "@/lib/use-sensitive-sign-in-wall";

/**
 * What the watch page shows when core refused the video with 401
 * `sign_in_required`. Two different rules answer that code — a members-only
 * (internal) video, and a sensitive video on an instance that asks for an
 * account first — and the reason given must fit: an instance with the wall up
 * must not call a public video "members only".
 */
export function WatchSignInRequired() {
  const t = useT();
  const wall = useSensitiveSignInWall();
  return (
    <SignInGate title={t("watch.signIn.title")}>
      {t(wall ? "watch.signIn.bodyWall" : "watch.signIn.body")}
    </SignInGate>
  );
}
