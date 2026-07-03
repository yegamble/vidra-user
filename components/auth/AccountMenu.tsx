"use client";

import Link from "next/link";

import { useSession } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { userAvatarUrl } from "@/lib/api";

// AccountMenu reflects session state in the header: a sign-in link when anon,
// the avatar + username + sign-out when authenticated, and a quiet placeholder
// while the boot-time silent refresh decides which (avoids a "Sign in" flash on
// reload). The avatar image is decorative (alt="") — the username next to it is
// the accessible name of the settings link.
export function AccountMenu() {
  const { status, user, logout } = useSession();

  if (status === "restoring") {
    return (
      <span
        role="status"
        aria-label="Checking your session"
        className="inline-block h-7 w-16 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800"
      >
        <span className="sr-only">Checking your session…</span>
      </span>
    );
  }

  if (status === "authed" && user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/settings"
          className="flex items-center gap-2 font-medium text-zinc-700 hover:underline dark:text-zinc-200"
        >
          <Avatar
            src={user.has_avatar ? userAvatarUrl(user.id) : null}
            name={user.display_name || user.username}
            className="h-6 w-6 text-xs"
          />
          {user.username}
        </Link>
        <button
          type="button"
          onClick={() => {
            void logout();
          }}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-zinc-600 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      Sign in
    </Link>
  );
}
