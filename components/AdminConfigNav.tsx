"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/components/auth/AuthProvider";
import { CONFIG_PAGES } from "@/lib/admin-config-ia";
import { cn } from "@/lib/cn";

// AdminConfigNav is the persistent left rail of the instance-configuration IA
// (config-parity W2): the config pages, PeerTube's grouping under Apple
// HIG presentation. On desktop it renders as a vertical rail beside the page
// content; below lg it collapses to a horizontal scrollable pill row (the
// AdminConsole rail is desktop-only, so this is the whole config nav there).
// Self-hides for non-admins so it never appears above the "Administrators
// only" gate.
export function AdminConfigNav() {
  const pathname = usePathname();
  const { user } = useSession();

  if (user?.role !== "admin") return null;

  return (
    <nav aria-label="Configuration pages" className="lg:w-44 lg:shrink-0">
      {/* Mobile: horizontal pills. Desktop: sticky vertical rail. */}
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
        {CONFIG_PAGES.map((page) => {
          const href = `/admin/config/${page.id}`;
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <li key={page.id} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={page.description}
                className={cn(
                  "focus-ring flex items-center whitespace-nowrap rounded-[9px] px-3 py-2 text-[13.5px] transition-colors",
                  active
                    ? "bg-surface-muted font-semibold text-fg"
                    : "font-medium text-fg-muted hover:bg-surface-muted hover:text-fg",
                )}
              >
                {page.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
