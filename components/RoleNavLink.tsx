"use client";

import Link from "next/link";

import { useSession } from "@/components/auth/AuthProvider";

/**
 * RoleNavLink renders a nav entry only for a sufficient role, and renders
 * NOTHING otherwise — the self-hiding counterpart to `RoleGate`, which shows an
 * "Administrators only" prompt instead. A nav bar wants the first behaviour (an
 * entry a viewer cannot use should not be there); a route wants the second (a
 * bookmarked URL deserves an explanation).
 *
 * The role test is `RoleGate`'s, spelled the same way: admins pass everything,
 * moderators pass a `minRole="moderator"` link. The session lives in memory, so
 * this is empty for anonymous viewers and immediately after a hard reload,
 * until refresh-token rehydration lands.
 *
 * `className` lets the desktop nav and the collapsed mobile menu style the same
 * link differently.
 */
export function RoleNavLink({
  minRole,
  href,
  label,
  className = "focus-ring rounded-sm transition-colors hover:text-fg",
}: {
  minRole: "admin" | "moderator";
  href: string;
  label: string;
  className?: string;
}) {
  const { user } = useSession();
  const role = user?.role;
  const allowed = role === "admin" || (minRole === "moderator" && role === "moderator");
  if (!allowed) return null;
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

/** The Admin nav entry — admins only. */
export function AdminNavLink({ className }: { className?: string }) {
  return <RoleNavLink minRole="admin" href="/admin/users" label="Admin" className={className} />;
}

/** The Moderation nav entry — moderators and admins. */
export function ModerationNavLink({ className }: { className?: string }) {
  return (
    <RoleNavLink minRole="moderator" href="/moderation" label="Moderation" className={className} />
  );
}
