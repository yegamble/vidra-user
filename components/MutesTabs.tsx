"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/mutes", label: "Accounts" },
  { href: "/settings/mutes/instances", label: "Instances" },
];

// MutesTabs is the sub-navigation shared by the mute-management surfaces:
// per-account mutes and per-instance (federation) mutes.
export function MutesTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Mute types">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "focus-ring rounded-full border border-accent bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg"
                : "focus-ring rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-muted"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
