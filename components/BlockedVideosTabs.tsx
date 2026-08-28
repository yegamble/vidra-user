"use client";

import { useSession } from "@/components/auth/AuthProvider";
import { PillTabs, type PillTabItem } from "@/components/ui/PillTabs";

const TABS: readonly PillTabItem[] = [
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

  if (user?.role !== "admin" && user?.role !== "moderator") return null;

  return <PillTabs tabs={TABS} label="Blocked video origin" className="mb-4" />;
}
