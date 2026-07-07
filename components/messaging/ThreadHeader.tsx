"use client";

import Link from "next/link";

import { LockIcon } from "@/components/e2ee/LockIcon";
import { ReportButton } from "@/components/ReportButton";
import { Avatar } from "@/components/ui/Avatar";
import { userAvatarUrl } from "@/lib/api";

// ThreadHeader anchors the thread's identity while the timeline scrolls: a back
// chevron, the peer's avatar, name + @username (or an "Encrypted conversation"
// line + lock on E2EE threads), and a Report affordance. It is sticky at the top
// of the thread pane with the app-shell's hairline + translucent treatment.
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
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
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
              <LockIcon className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
        {encrypted ? (
          <span className="truncate text-[12px] text-fg-muted">Encrypted conversation</span>
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
