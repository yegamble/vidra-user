"use client";

import { PillTabs, type PillTabItem } from "@/components/ui/PillTabs";

const TABS: readonly PillTabItem[] = [
  { href: "/settings/blocks", label: "Accounts" },
  { href: "/settings/blocks/remote", label: "Remote accounts" },
];

// BlocksTabs is the sub-navigation across the two block surfaces, mirroring
// MutesTabs. They are separate lists rather than one because the identities are
// different in kind — a local user uuid against a federated actor URL — and so
// is the effect: a local block also cuts off direct messages, which has no
// meaning across the federation boundary.
export function BlocksTabs() {
  return <PillTabs tabs={TABS} label="Block types" className="mb-6" />;
}
