"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ProtocolBadge } from "@/components/ProtocolBadge";
import { ChevronDownIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";
import { channelAvatarUrl } from "@/lib/api";
import { cn } from "@/lib/cn";

import { useStudio } from "./StudioContext";

// The studio tab strip — the five surfaces the studio is split into. Active state
// is derived from the pathname (exact match; the sub-routes are distinct paths).
const TABS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/studio", label: "Dashboard" },
  { href: "/studio/content", label: "Content" },
  { href: "/studio/live", label: "Live" },
  { href: "/studio/analytics", label: "Analytics" },
  { href: "/studio/channel", label: "Channel" },
];

// StudioNav is the sticky row under the studio page title: the current-channel
// identity/switcher on top, then the horizontally-scrollable tab strip. The
// switcher is a Dropdown when the caller has more than one channel; a static
// label when they have exactly one; and a "no channel yet" hint when they have
// none (the tab strip still renders so the surfaces stay reachable — each shows
// its own onboarding state).
export function StudioNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Studio sections"
      className="sticky top-2 z-20 -mx-1 mb-6 flex flex-col gap-3 px-1"
    >
      <ChannelSwitcher />
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm transition-colors",
                active
                  ? "bg-accent/12 font-semibold text-accent-text"
                  : "text-fg-muted hover:bg-surface-muted hover:text-fg",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ChannelSwitcher() {
  const router = useRouter();
  const { channels, currentChannel, currentHandle, setCurrentHandle } = useStudio();

  // Zero channels: a quiet hint (the Channel tab / dashboard drive the onboarding
  // create flow); the tab strip below still renders.
  if (channels.length === 0) {
    return (
      <div className="flex items-center gap-2 px-1 text-sm text-fg-muted">
        <span
          aria-hidden="true"
          className="h-9 w-9 shrink-0 rounded-full bg-surface-muted"
        />
        <span>No channel yet</span>
        <Link
          href="/studio/channel?create=1"
          className="focus-ring rounded-full font-semibold text-accent-text hover:underline"
        >
          Create one
        </Link>
      </div>
    );
  }

  const channel = currentChannel ?? channels[0];
  const identity = (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar
        src={channel.has_avatar ? channelAvatarUrl(channel.handle) : null}
        name={channel.display_name || channel.handle}
        alt=""
        className="h-9 w-9 shrink-0"
      />
      <span className="flex min-w-0 flex-col items-start text-left">
        <span className="truncate text-sm font-semibold text-fg">{channel.display_name}</span>
        <span className="truncate text-[12px] text-fg-muted">@{channel.handle}</span>
      </span>
    </span>
  );

  // Exactly one channel: a static identity, no dropdown.
  if (channels.length === 1) {
    return (
      <div className="flex items-center justify-between gap-2 px-1">
        {identity}
        <ProtocolBadge protocol="activitypub" className="hidden sm:inline-flex" />
      </div>
    );
  }

  // More than one channel: a Dropdown switcher (channel rows + a "New channel"
  // entry). Switching a channel updates the studio scope without navigating;
  // "New channel" routes to the Channel tab's create dialog.
  const items: DropdownItem[] = [
    ...channels.map((c) => ({
      label: (
        <span className="flex items-center gap-2.5">
          <Avatar
            src={c.has_avatar ? channelAvatarUrl(c.handle) : null}
            name={c.display_name || c.handle}
            alt=""
            className="h-7 w-7 shrink-0"
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-fg">{c.display_name}</span>
            <span className="truncate text-[12px] text-fg-muted">@{c.handle}</span>
          </span>
          {c.handle === currentHandle ? (
            <span className="ml-auto text-[12px] font-semibold text-accent-text">Current</span>
          ) : null}
        </span>
      ),
      onSelect: () => setCurrentHandle(c.handle),
    })),
    {
      label: <span className="font-semibold text-accent-text">+ New channel</span>,
      onSelect: () => router.push("/studio/channel?create=1"),
    },
  ];

  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <Dropdown
        trigger={
          <span className="flex items-center gap-2">
            {identity}
            <ChevronDownIcon size={16} className="shrink-0 text-fg-muted" aria-hidden="true" />
          </span>
        }
        triggerLabel={`Switch channel (current: ${channel.display_name})`}
        items={items}
        align="start"
        triggerClassName="max-w-full !rounded-2xl !px-2 !py-1.5"
      />
      <ProtocolBadge protocol="activitypub" className="hidden sm:inline-flex" />
    </div>
  );
}
