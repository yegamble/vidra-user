"use client";

import { usePathname, useRouter } from "next/navigation";

import { useSession } from "@/components/auth/AuthProvider";
import { Select } from "@/components/ui/Select";
import { ADMIN_NAV, adminNavCurrentHref } from "@/lib/admin-nav";

// AdminTabs is the admin section switcher below `lg`, where the desktop
// AdminConsole rail is hidden. The old ten-item horizontal tab strip is retired
// (redesign 2026-07-19: no 5+ horizontal tab strips); on phones the sections
// drill in from a single compact `Select` — the sanctioned mobile idiom — while
// the console rail carries the nav at `lg`. Self-hides for anonymous/regular
// viewers so it never appears above an "Administrators only" gate.
//
// The options are the admin-nav registry (lib/admin-nav.ts) in full, in rail
// order. When this list was hand-maintained it silently lost the moderation
// destinations, which stranded a phone-bound admin: the rail that carries them
// is `lg:`-only, so below that width there was NO route to the report queue.
export function AdminTabs() {
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (user?.role !== "admin") return null;

  return (
    <nav aria-label="Admin sections" className="mb-6 lg:hidden">
      <Select
        label="Admin section"
        value={adminNavCurrentHref(pathname)}
        onChange={(e) => router.push(e.target.value)}
      >
        {ADMIN_NAV.map((item) => (
          <option key={item.href} value={item.href}>
            {item.label}
          </option>
        ))}
      </Select>
    </nav>
  );
}
