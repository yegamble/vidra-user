"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/components/auth/AuthProvider";

const TABS = [
  { href: "/admin/users", label: "Users" },
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
    <nav className="mb-6 flex gap-2" aria-label="Admin sections">
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
