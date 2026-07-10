"use client";

import Link from "next/link";

import { useSession } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { userAvatarUrl } from "@/lib/api";

// AccountMenu reflects session state in the header: a sign-in link when anon,
// the avatar + username + sign-out when authenticated, and a quiet placeholder
// while the boot-time silent refresh decides which (avoids a "Sign in" flash on
// reload). The avatar image is decorative (alt="") — the username next to it is
// the accessible name of the settings link. On phones the username and
// sign-out collapse away (settings owns sign-out there); the avatar remains
// the tap target for /settings, per the design template.
export function AccountMenu() {
  const { status, user, logout } = useSession();

  if (status === "restoring") {
    return (
      <span
        role="status"
        aria-label="Checking your session"
        className="inline-block h-8 w-8 animate-pulse rounded-full bg-surface-muted sm:w-16 sm:rounded-full"
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
          className="focus-ring flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full font-medium text-fg sm:justify-start"
        >
          <Avatar
            src={user.has_avatar ? userAvatarUrl(user.id) : null}
            name={user.display_name || user.username}
            className="h-8 w-8 text-xs"
          />
          <span className="hidden sm:inline">{user.username}</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            void logout();
          }}
          className="focus-ring hidden min-h-9 rounded-full border border-border px-3 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:inline-flex"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="focus-ring inline-flex min-h-11 items-center rounded-full border border-border px-4 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted sm:min-h-9"
    >
      Sign in
    </Link>
  );
}
