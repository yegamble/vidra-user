"use client";

import type { ReactNode } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { TextLink } from "@/components/ui/TextLink";

/**
 * SignInGate wraps a signed-in-only surface's prompt: the shared "Sign in to
 * …" `EmptyState`, with the /login link already in it. The sibling of
 * `RoleGate` (which prompts an under-privileged viewer) and of `RoleNavLink`
 * (which self-hides instead) — this is the one for "signed out at all".
 *
 * Call sites keep their own `status !== "authed"` test, because they need it
 * anyway to decide whether to mount the gated content; this owns only what is
 * rendered when that test passes. The session lives in memory, so a hard reload
 * lands on this prompt until refresh-token rehydration finishes.
 *
 * `children` is the copy that FOLLOWS the link and completes the sentence —
 * "…to follow channels and watch their latest videos here."
 */
export function SignInGate({
  title,
  icon,
  lead,
  restoringLabel,
  children,
}: {
  title: string;
  /** Optional glyph for the EmptyState's tinted circle. */
  icon?: ReactNode;
  /** Copy BEFORE the link, e.g. "Your session has ended." A space is added after it. */
  lead?: ReactNode;
  /**
   * Show a spinner with this label while the boot-time silent refresh is still
   * in flight, instead of the prompt.
   *
   * Opt-in rather than automatic because the surfaces genuinely differ today:
   * the settings pages spell "restoring" as loading (which is what the session
   * contract asks for), while the library/feed surfaces flash the prompt. Making
   * it automatic would change what a dozen views render mid-restore, so each
   * call site keeps the behaviour it had.
   */
  restoringLabel?: string;
  children: ReactNode;
}) {
  const { status } = useSession();

  if (restoringLabel && status === "restoring") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={restoringLabel} />
      </div>
    );
  }

  return (
    <EmptyState
      icon={icon}
      title={title}
      message={
        <>
          {lead ? <>{lead} </> : null}
          <TextLink href="/login">Sign in</TextLink> {children}
        </>
      }
    />
  );
}
