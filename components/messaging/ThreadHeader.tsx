"use client";

import Link from "next/link";

import { ChevronLeftIcon, LockIcon } from "@/components/icons";
import { ReportButton } from "@/components/ReportButton";
import { Avatar } from "@/components/ui/Avatar";
import { userAvatarUrl } from "@/lib/api";

// ThreadHeader anchors the thread's identity while the timeline scrolls: a back
// chevron, the peer's avatar, name + @username (or, on E2EE threads, a lock + the
// design's success-tinted "End-to-end encrypted" status line), and a Report
// affordance. It is sticky at the top of the thread pane with the app-shell's
// hairline + translucent treatment. (The design draws a "· disappearing 7d"
// suffix on that line; no message-retention/TTL contract is surfaced, so per
// spec §5.6 it is aspirational and omitted — we state only what is real.)
export function ThreadHeader({
  name,
  username,
  otherUserId,
  encrypted,
}: {
  name: string;
  username?: string;
  otherUserId?: string;
  encrypted: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2.5 border-b border-border-subtle bg-canvas/80 px-4 py-2.5 backdrop-blur">
      <Link
        href="/messages"
        aria-label="Back to messages"
        className="focus-ring -ml-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
      >
        <ChevronLeftIcon size={20} strokeWidth={2.2} />
      </Link>

      <Avatar
        src={otherUserId && !encrypted ? userAvatarUrl(otherUserId) : null}
        name={name}
        alt=""
        className="h-8 w-8 text-sm"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <h1 className="truncate text-[15px] font-semibold leading-tight text-fg">
            {name}
          </h1>
          {encrypted ? (
            <span className="shrink-0 text-fg-muted" aria-hidden>
              <LockIcon size={14} />
            </span>
          ) : null}
        </div>
        {encrypted ? (
          <span className="truncate text-[11.5px] font-medium text-success">
            End-to-end encrypted
          </span>
        ) : username ? (
          <span className="truncate text-[12px] text-fg-muted">@{username}</span>
        ) : null}
      </div>

      {otherUserId ? (
        <div className="shrink-0">
          <ReportButton kind="account" targetId={otherUserId} variant="link" />
        </div>
      ) : null}
    </header>
  );
}
