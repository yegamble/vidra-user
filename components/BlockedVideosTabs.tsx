"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/components/auth/AuthProvider";

const TABS = [
  { href: "/moderation/blocked", label: "Local" },
  { href: "/moderation/blocked/remote", label: "Remote" },
];

// BlockedVideosTabs splits the moderation block-list by content origin: local
// videos (this instance's uploads) vs federated remote videos. Separate tabs —
// not a merged list — because the row shape and actions differ (a local row
// links to /videos/{id} and its channel; a blocked remote row is hidden from
// /remote/{id} so it links out to its origin instead). Self-hides for
// anonymous/regular viewers so it never appears above a "Moderators only" gate.
export function BlockedVideosTabs() {
  const { user } = useSession();
  const pathname = usePathname();

  if (user?.role !== "admin" && user?.role !== "moderator") return null;

  return (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Blocked video origin">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
