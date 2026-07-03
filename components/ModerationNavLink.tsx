"use client";

import Link from "next/link";

import { useSession } from "@/components/auth/AuthProvider";

// ModerationNavLink renders the Moderation nav entry only for moderators/admins.
// The session lives in memory, so this is empty for anonymous/regular viewers and
// after a hard reload (until refresh-token rehydration lands). `className` lets
// the desktop nav and the collapsed mobile menu style the same link differently.
export function ModerationNavLink({
  className = "hover:text-zinc-900 dark:hover:text-zinc-100",
}: {
  className?: string;
}) {
  const { user } = useSession();
  if (user?.role !== "admin" && user?.role !== "moderator") return null;
  return (
    <Link href="/moderation" className={className}>
      Moderation
    </Link>
  );
}
