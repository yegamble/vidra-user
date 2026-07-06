"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/components/auth/AuthProvider";

const TABS = [
  { href: "/moderation", label: "Reports" },
  { href: "/moderation/quarantine", label: "Quarantine" },
  { href: "/moderation/blocked", label: "Blocked videos" },
  { href: "/moderation/videos", label: "All videos" },
  { href: "/moderation/comments", label: "Comments" },
  { href: "/moderation/watched-words", label: "Watched words" },
  { href: "/moderation/watched-word-matches", label: "Word matches" },
  { href: "/moderation/instances", label: "Instances" },
];

// ModerationTabs is the sub-navigation shared by the moderation surfaces (the
// report queue and the blocked-video list). It self-hides for anonymous/regular
// viewers so it never appears above a "Moderators only" gate.
export function ModerationTabs() {
  const { user } = useSession();
  const pathname = usePathname();

  if (user?.role !== "admin" && user?.role !== "moderator") return null;

  return (
    <nav className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Moderation sections">
      <div className="flex min-w-max items-center gap-5 border-b border-border-subtle">
        {TABS.map((tab) => {
          // "Blocked videos" stays lit on its sub-tabs (/moderation/blocked/remote).
          const active =
            pathname === tab.href ||
            (tab.href === "/moderation/blocked" && pathname.startsWith("/moderation/blocked/"));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "focus-ring -mb-px flex h-11 items-center whitespace-nowrap border-b-2 border-fg text-sm font-semibold text-fg"
                  : "focus-ring -mb-px flex h-11 items-center whitespace-nowrap border-b-2 border-transparent text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
