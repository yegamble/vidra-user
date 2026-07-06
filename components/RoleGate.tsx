"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";

// RoleGate wraps a privileged surface: it renders its children only when the
// signed-in user's role is sufficient, and otherwise shows the shared
// permission prompt. The gate never lets a privileged fetch mount for an
// under-privileged viewer, so gated pages produce no 403s. The session lives
// in memory, so a hard reload lands here signed out — the prompt covers both
// anonymous and under-privileged sessions.
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
  const { user } = useSession();
  const role = user?.role;
  const allowed =
    role === "admin" || (minRole === "moderator" && role === "moderator");

  if (!allowed) {
    const admin = minRole === "admin";
    return (
      <EmptyState
        title={admin ? "Administrators only" : "Moderators only"}
        message={
          <>
            {admin
              ? "This page is for administrators."
              : "This page is for moderators and administrators."}{" "}
            <Link
              href="/login"
              className="focus-ring rounded underline underline-offset-2 transition-colors hover:text-fg"
            >
              Sign in
            </Link>{" "}
            with {admin ? "an admin" : "a moderator"} account to {action}.
          </>
        }
      />
    );
  }

  return <>{children}</>;
}
