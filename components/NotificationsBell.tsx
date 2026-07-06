"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";

// NotificationsBell is the header entry to /notifications with an unread badge.
// It refetches the unread count on mount and whenever the route changes, so the
// badge reflects reads made on the notifications page after navigating away.
// Renders nothing for anonymous visitors.
export function NotificationsBell() {
  const { status } = useSession();
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    // When signed out the bell renders nothing, so there's no stale badge to
    // clear; a fresh count is fetched again when status flips back to authed.
    if (status !== "authed") return;
    const controller = new AbortController();
    api
      .getUnreadNotificationCount(controller.signal)
      .then((res) => setCount(res.unread_count))
      .catch(() => {
        // A failed count is non-critical; leave the badge as-is.
      });
    return () => controller.abort();
  }, [status, pathname]);

  if (status !== "authed") return null;

  const label = count > 0 ? `Notifications (${count} unread)` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="focus-ring relative inline-flex h-9 w-9 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-muted"
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
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 ? (
        <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-semibold leading-4 text-danger-fg ring-2 ring-canvas">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
