"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";

// RoleGate wraps a privileged surface: it renders its children only when the
// signed-in user's role is sufficient, and otherwise shows the shared
// permission prompt. The gate never lets a privileged fetch mount for an
// under-privileged viewer, so gated pages produce no 403s. The session lives
// in memory, so a hard reload lands here signed out — but the prompt must not
// be shown while that is still being decided: the session is redeemed
// asynchronously from the httpOnly refresh cookie, and rendering the refusal
// during "restoring" flashes "Administrators only" at an actual administrator
// on every hard reload (A40). Hold instead, then answer.
//
// The refusal itself is two different sentences, because the two viewers need
// different things: a signed-out visitor needs a way in, and a signed-in one
// needs to be told their account is not enough — telling them to "sign in" when
// they already are is the kind of copy that sends people to support.
//
// minRole="admin"     → admins only            ("Administrators only")
// minRole="moderator" → moderators and admins  ("Moderators only")
//
// `action` completes the prompt sentence: "Sign in with an admin account to
// {action}." — e.g. action="manage users".
export function RoleGate({
  minRole,
  action,
  children,
}: {
  minRole: "admin" | "moderator";
  action: string;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const role = user?.role;
  const allowed =
    role === "admin" || (minRole === "moderator" && role === "moderator");

  if (status === "restoring") return <Spinner label="Checking your access" />;

  if (!allowed) {
    const admin = minRole === "admin";
    const audience = admin ? "administrators" : "moderators and administrators";
    return (
      <EmptyState
        title={admin ? "Administrators only" : "Moderators only"}
        message={
          status === "authed" ? (
            <>This page is for {audience}, and your account does not have access to {action}.</>
          ) : (
            <>
              This page is for {audience}.{" "}
              <Link
                href="/login"
                className="focus-ring rounded underline underline-offset-2 transition-colors hover:text-fg"
              >
                Sign in
              </Link>{" "}
              with {admin ? "an admin" : "a moderator"} account to {action}.
            </>
          )
        }
      />
    );
  }

  return <>{children}</>;
}
