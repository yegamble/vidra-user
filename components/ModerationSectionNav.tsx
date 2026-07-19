"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import {
  ChevronDownIcon,
  EyeIcon,
  FlagIcon,
  HashIcon,
  MessageCircleIcon,
  ServerIcon,
  ShieldIcon,
  SlashCircleIcon,
  VideoIcon,
} from "@/components/icons";
import { Dropdown } from "@/components/ui/Dropdown";
import { cn } from "@/lib/cn";

type Section = { href: string; label: string; icon: ReactNode };

// The moderation surfaces, ordered as a Mail-style section sidebar. Reports is
// the mail-triage home; the rest are the review/blocklist tools that used to
// live in a horizontal tab strip.
const SECTIONS: Section[] = [
  { href: "/moderation", label: "Reports", icon: <FlagIcon size={18} /> },
  { href: "/moderation/quarantine", label: "Quarantine", icon: <ShieldIcon size={18} /> },
  { href: "/moderation/blocked", label: "Blocked videos", icon: <SlashCircleIcon size={18} /> },
  { href: "/moderation/videos", label: "All videos", icon: <VideoIcon size={18} /> },
  { href: "/moderation/comments", label: "Comments", icon: <MessageCircleIcon size={18} /> },
  { href: "/moderation/watched-words", label: "Watched words", icon: <EyeIcon size={18} /> },
  {
    href: "/moderation/watched-word-matches",
    label: "Word matches",
    icon: <HashIcon size={18} />,
  },
  { href: "/moderation/instances", label: "Instances", icon: <ServerIcon size={18} /> },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/moderation") return pathname === "/moderation";
  // "Blocked videos" stays lit on its Local/Remote sub-routes.
  if (href === "/moderation/blocked") return pathname.startsWith("/moderation/blocked");
  return pathname === href || pathname.startsWith(`${href}/`);
}

// ModerationSectionNav is the split-view section navigation shared by every
// moderation surface (rendered once by app/moderation/layout.tsx). It replaces
// the old horizontal 9-tab strip: a vertical tint-pill rail from `md` up
// (Mail-sidebar style), and a compact section switcher below that. It self-hides
// for anonymous/regular viewers so it never appears above a "Moderators only"
// gate.
export function ModerationSectionNav() {
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (user?.role !== "admin" && user?.role !== "moderator") return null;

  const current = SECTIONS.find((s) => isActive(pathname, s.href)) ?? SECTIONS[0];

  return (
    <>
      {/* Desktop: vertical section rail, tint-pill active. */}
      <nav
        aria-label="Moderation sections"
        className="hidden md:flex md:w-52 md:shrink-0 md:flex-col md:gap-1"
      >
        {SECTIONS.map((s) => {
          const active = isActive(pathname, s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-subhead transition-colors",
                active
                  ? "bg-accent/12 font-semibold text-accent-text"
                  : "text-fg-muted hover:bg-surface-muted hover:text-fg",
              )}
            >
              <span aria-hidden className="shrink-0">
                {s.icon}
              </span>
              <span className="truncate">{s.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile: compact section switcher (not a horizontal tab strip). */}
      <div className="md:hidden">
        <Dropdown
          align="start"
          className="w-full"
          triggerClassName="w-full min-h-11 justify-between"
          triggerLabel={`Moderation section: ${current.label}`}
          trigger={
            <>
              <span className="flex min-w-0 items-center gap-2 truncate">
                <span aria-hidden className="shrink-0 text-fg-muted">
                  {current.icon}
                </span>
                <span className="truncate">{current.label}</span>
              </span>
              <ChevronDownIcon size={16} aria-hidden />
            </>
          }
          items={SECTIONS.map((s) => ({
            label: s.label,
            onSelect: () => router.push(s.href),
          }))}
        />
      </div>
    </>
  );
}
