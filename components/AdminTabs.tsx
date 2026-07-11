"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/components/auth/AuthProvider";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/registration-requests", label: "Registration" },
  { href: "/admin/config", label: "Config" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/import-peertube", label: "Import" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/audit-log", label: "Audit log" },
  { href: "/admin/system", label: "System" },
];

// AdminTabs is the sub-navigation shared by the admin surfaces. It self-hides for
// anonymous/regular viewers so it never appears above an "Administrators only" gate.
export function AdminTabs() {
  const { user } = useSession();
  const pathname = usePathname();

  if (user?.role !== "admin") return null;

  return (
    <nav
      className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:hidden"
      aria-label="Admin sections"
    >
      <div className="flex min-w-max items-center gap-1 border-b border-border-subtle">
        {TABS.map((tab) => {
          // Sub-routes light their tab too (Config is a layout route with
          // per-page children, e.g. /admin/config/general). The Overview tab
          // stays exact so it never shadows the others.
          const active =
            tab.href === "/admin"
              ? pathname === tab.href
              : pathname === tab.href || pathname?.startsWith(`${tab.href}/`) === true;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "focus-ring whitespace-nowrap border-b-2 border-accent px-3 py-3 text-sm font-semibold text-fg"
                  : "focus-ring whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
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
