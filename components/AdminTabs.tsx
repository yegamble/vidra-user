"use client";

import { usePathname, useRouter } from "next/navigation";

import { useSession } from "@/components/auth/AuthProvider";
import { Select } from "@/components/ui/Select";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/registration-requests", label: "Registration" },
  { href: "/admin/federation/follower-requests", label: "Followers" },
  { href: "/admin/config", label: "Config" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/import-peertube", label: "Import" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/audit-log", label: "Audit log" },
  { href: "/admin/system", label: "System" },
  { href: "/admin/infrastructure", label: "Infrastructure" },
  { href: "/admin/playback-health", label: "Playback health" },
];

// AdminTabs is the admin section switcher below `lg`, where the desktop
// AdminConsole rail is hidden. The old ten-item horizontal tab strip is retired
// (redesign 2026-07-19: no 5+ horizontal tab strips); on phones the sections
// drill in from a single compact `Select` — the sanctioned mobile idiom — while
// the console rail carries the nav at `lg`. Self-hides for anonymous/regular
// viewers so it never appears above an "Administrators only" gate.
export function AdminTabs() {
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (user?.role !== "admin") return null;

  // Which section owns the current path. Sub-routes resolve to their parent
  // (Config is a layout route, e.g. /admin/config/general); Overview stays exact
  // so it never shadows the others.
  const current =
    TABS.find((tab) =>
      tab.href === "/admin"
        ? pathname === tab.href
        : pathname === tab.href || pathname?.startsWith(`${tab.href}/`) === true,
    )?.href ?? "/admin";

  return (
    <nav aria-label="Admin sections" className="mb-6 lg:hidden">
      <Select
        label="Admin section"
        value={current}
        onChange={(e) => router.push(e.target.value)}
      >
        {TABS.map((tab) => (
          <option key={tab.href} value={tab.href}>
            {tab.label}
          </option>
        ))}
      </Select>
    </nav>
  );
}
