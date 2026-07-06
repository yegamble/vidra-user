"use client";

import Link from "next/link";

import { useSession } from "@/components/auth/AuthProvider";

// AdminNavLink renders the Admin nav entry only for admins. The session lives in
// memory, so this is empty for anonymous/regular viewers and after a hard reload
// (until refresh-token rehydration lands). `className` lets the desktop nav and
// the collapsed mobile menu style the same link differently.
export function AdminNavLink({
  className = "transition-colors hover:text-fg",
}: {
  className?: string;
}) {
  const { user } = useSession();
  if (user?.role !== "admin") return null;
  return (
    <Link href="/admin/users" className={className}>
      Admin
    </Link>
  );
}
