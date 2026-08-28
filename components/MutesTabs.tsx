"use client";

import { PillTabs, type PillTabItem } from "@/components/ui/PillTabs";

const TABS: readonly PillTabItem[] = [
  { href: "/settings/mutes", label: "Accounts" },
  { href: "/settings/mutes/instances", label: "Instances" },
];

// MutesTabs is the sub-navigation shared by the mute-management surfaces:
// per-account mutes and per-instance (federation) mutes.
export function MutesTabs() {
  return <PillTabs tabs={TABS} label="Mute types" className="mb-6" />;
}
