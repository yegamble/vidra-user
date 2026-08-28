"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import {
  GlobeIcon, GridIcon, KeyboardIcon, LogOutIcon, MonitorIcon, SettingsIcon,
  ShieldIcon, UserIcon, VideoIcon,
} from "@/components/icons";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { Avatar } from "@/components/ui/Avatar";
import { Toggle } from "@/components/ui/Toggle";
import { userAvatarUrl } from "@/lib/api";
import {
  useDisplayLanguage, useRestrictedMode, writeDisplayLanguage, writeRestrictedMode,
} from "@/lib/device-preferences";
import { SHORTCUT_IGNORE_SELECTOR } from "@/lib/player-shortcuts";
import { useThemePreference, writeThemePreference, type ThemePreference } from "@/lib/theme";

const themeLabels: Record<ThemePreference, string> = { system: "Device", light: "Light", dark: "Dark" };

export function AccountMenu() {
  const { status, user, logout } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chordRef = useRef<{ key: string; at: number } | null>(null);
  const theme = useThemePreference();
  const language = useDisplayLanguage();
  const restricted = useRestrictedMode();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("[data-account-action]")?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      if (target?.matches(SHORTCUT_IGNORE_SELECTOR) || target?.closest(SHORTCUT_IGNORE_SELECTOR)) return;
      if (event.key === "?") {
        if (status !== "authed") return;
        event.preventDefault();
        setOpen(false);
        setShortcutsOpen(true);
        return;
      }
      if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>('input[aria-label="Search videos"]');
        if (search) { event.preventDefault(); search.focus(); }
        return;
      }
      const now = Date.now();
      if (event.key.toLowerCase() === "g") { chordRef.current = { key: "g", at: now }; return; }
      if (!chordRef.current || now - chordRef.current.at > 1200) return;
      chordRef.current = null;
      const destinations: Record<string, string | undefined> = {
        h: "/", l: "/library", s: status === "authed" ? "/studio" : undefined,
        p: status === "authed" && user ? `/users/${encodeURIComponent(user.username)}${user.profile_public ? "" : "?preview=1"}` : undefined,
      };
      const destination = destinations[event.key.toLowerCase()];
      if (destination) { event.preventDefault(); router.push(destination); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router, status, user]);

  if (status === "restoring") {
    return <span role="status" aria-label="Checking your session" className="inline-block h-9 w-9 animate-pulse rounded-full bg-surface-muted"><span className="sr-only">Checking your session…</span></span>;
  }
  if (status !== "authed" || !user) {
    return <Link href="/login" className="focus-ring inline-flex min-h-11 items-center rounded-[10px] border border-border px-4 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted sm:min-h-9">Sign in</Link>;
  }

  const profileHref = `/users/${encodeURIComponent(user.username)}${user.profile_public ? "" : "?preview=1"}`;
  const name = user.display_name || user.username;
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open account menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); }
        }}
        className="focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-full"
      >
        <Avatar src={user.has_avatar ? userAvatarUrl(user.id) : null} name={name} className="h-9 w-9 text-xs" />
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Account menu"
          onClick={(event) => {
            if ((event.target as Element).closest("a")) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); return; }
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            const actions = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-account-action]") ?? []);
            const current = actions.indexOf(document.activeElement as HTMLElement);
            const next = event.key === "ArrowDown" ? (current + 1) % actions.length : (current - 1 + actions.length) % actions.length;
            event.preventDefault(); actions[next]?.focus();
          }}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(720px,calc(100vh-6rem))] w-[min(360px,calc(100vw-1rem))] overflow-y-auto rounded-[20px] border border-border-subtle bg-surface-raised py-2 shadow-soft-strong"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar src={user.has_avatar ? userAvatarUrl(user.id) : null} name={name} className="h-12 w-12 shrink-0" />
            <div className="min-w-0"><p className="truncate text-sm font-bold text-fg">{name}</p><p className="truncate text-[13px] text-fg-muted">@{user.username}</p></div>
          </div>
          <MenuGroup>
            <MenuLink href={profileHref} icon={<UserIcon />} label="Your profile" note={user.profile_public ? undefined : "Private preview"} />
            <MenuLink href="/studio" icon={<VideoIcon />} label="Studio" />
            <MenuLink href="/settings" icon={<SettingsIcon />} label="Settings" />
            {/* Below `sm` the Sidebar (the only chrome with ADMIN_LINK) is
                hidden, so this self-hiding row is a phone admin's only route
                into the console. Same glyph + destination as ADMIN_LINK. */}
            {user.role === "admin" ? <MenuLink href="/admin" icon={<GridIcon />} label="Admin" /> : null}
          </MenuGroup>
          <MenuGroup>
            <PreferenceRow icon={<MonitorIcon />} label="Appearance">
              <div className="flex gap-1" role="group" aria-label="Appearance">
                {(["system", "light", "dark"] as const).map((value) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => writeThemePreference(value)} className={theme === value ? "focus-ring rounded-full bg-accent px-2 py-1 text-[11px] font-semibold text-accent-fg" : "focus-ring rounded-full px-2 py-1 text-[11px] font-semibold text-fg-muted hover:bg-surface-muted"}>{themeLabels[value]}</button>)}
              </div>
            </PreferenceRow>
            <PreferenceRow icon={<GlobeIcon />} label="Display language">
              <select value={language} onChange={(event) => writeDisplayLanguage(event.target.value as "en")} className="focus-ring max-w-28 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-fg"><option value="en">English</option></select>
            </PreferenceRow>
            <PreferenceRow icon={<ShieldIcon />} label="Restricted Mode" note="Hide NSFW content">
              <Toggle checked={restricted} onChange={writeRestrictedMode} label="Restricted Mode" />
            </PreferenceRow>
            <button data-account-action type="button" onClick={() => { setOpen(false); setShortcutsOpen(true); }} className="focus-ring flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium text-fg transition-colors hover:bg-surface-muted"><KeyboardIcon className="shrink-0 text-fg-muted" /><span className="flex-1">Keyboard shortcuts</span><kbd className="text-xs text-fg-muted">?</kbd></button>
          </MenuGroup>
          <MenuGroup last>
            <button data-account-action type="button" onClick={() => { setOpen(false); void logout(); }} className="focus-ring flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium text-fg transition-colors hover:bg-surface-muted"><LogOutIcon className="text-fg-muted" />Sign out</button>
          </MenuGroup>
        </div>
      ) : null}
      {shortcutsOpen ? <KeyboardShortcutsModal onClose={() => setShortcutsOpen(false)} /> : null}
    </div>
  );
}

function MenuGroup({ children, last = false }: { children: ReactNode; last?: boolean }) {
  return <div className={last ? "px-1.5 py-1" : "border-b border-border-subtle px-1.5 py-1"}>{children}</div>;
}

function MenuLink({ href, icon, label, note }: { href: string; icon: ReactNode; label: string; note?: string }) {
  return <Link data-account-action href={href} className="focus-ring flex min-h-11 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"><span className="text-fg-muted">{icon}</span><span className="flex-1">{label}</span>{note ? <span className="text-xs text-fg-muted">{note}</span> : null}</Link>;
}

function PreferenceRow({ icon, label, note, children }: { icon: ReactNode; label: string; note?: string; children: ReactNode }) {
  return <div className="flex min-h-12 items-center gap-3 px-4 py-2.5"><span className="shrink-0 text-fg-muted">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-fg">{label}</span>{note ? <span className="block text-[11px] text-fg-muted">{note}</span> : null}</span>{children}</div>;
}
