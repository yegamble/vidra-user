"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { BellIcon } from "@/components/icons";
import {
  NotificationTypeIcon,
  describeNotification,
} from "@/components/NotificationsView";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/api";
import { relativeTime } from "@/lib/format";

// How many recent notifications the popover shows; the full list lives on
// /notifications ("See all notifications").
const PREVIEW_LIMIT = 6;

type PanelStatus = "loading" | "error" | "ready";

// NotificationsBell is the header notifications control: an unread-count badge
// plus a disclosure popover of the most recent notifications with a
// "See all notifications" footer link to /notifications. The count refetches on
// mount and on every route change; the recent list is fetched lazily each time
// the popover opens (so it is always fresh and costs nothing while closed).
// Popover a11y follows the shell's disclosure pattern: aria-expanded/controls
// on the trigger, focus moves into the panel on open and returns to the bell on
// close, Escape / outside-click / route-change dismiss. Renders nothing for
// anonymous visitors.
export function NotificationsBell() {
  const { status } = useSession();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [panelStatus, setPanelStatus] = useState<PanelStatus>("loading");
  const [items, setItems] = useState<Notification[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
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

  // Route changes (following a notification, or any other navigation) close
  // the popover quietly — adjusted during render (the React-recommended
  // prop/state-change pattern) so no effect has to set state synchronously.
  const [openedPath, setOpenedPath] = useState(pathname);
  if (open && openedPath !== pathname) {
    setOpen(false);
  }

  // Fetch the recent list each time the popover opens (the click handler puts
  // the panel into "loading" before opening, so this effect only runs I/O).
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api
      .getNotifications({ limit: PREVIEW_LIMIT }, controller.signal)
      .then((res) => {
        setItems(res.notifications.slice(0, PREVIEW_LIMIT));
        setCount(res.unread_count);
        setPanelStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setPanelStatus("error");
      });
    return () => controller.abort();
  }, [open]);

  // While open: Escape dismisses (restoring focus to the bell) and any pointer
  // press outside the panel or its button dismisses quietly.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Focus lands inside the panel on open so keyboard/screen-reader users are
  // taken to the content they just revealed (the "See all notifications" link
  // is always present, so there is always a focus target). Runs only on the
  // open transition — later status changes must not yank focus around.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [open]);

  if (status !== "authed") return null;

  const label = count > 0 ? `Notifications (${count} unread)` : "Notifications";

  function markReadQuietly(n: Notification) {
    if (n.read) return;
    setCount((c) => Math.max(0, c - 1));
    void api.markNotificationRead(n.id).catch(() => {
      // The full page resyncs counts; a failed background mark is non-critical.
    });
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          setPanelStatus("loading");
          setOpenedPath(pathname);
          setOpen(true);
        }}
        className="focus-ring relative inline-flex h-11 w-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-muted"
      >
        <BellIcon size={20} strokeWidth={2} />
        {count > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-semibold leading-4 text-danger-fg ring-2 ring-canvas">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          aria-label="Notifications"
          className="fixed inset-x-3 top-16 z-30 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised shadow-soft-strong sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <span className="text-[15px] font-bold tracking-tight text-fg">Notifications</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {panelStatus === "loading" ? (
              <div className="flex justify-center py-8">
                <Spinner label="Loading your notifications" />
              </div>
            ) : panelStatus === "error" ? (
              <p className="px-3 py-8 text-center text-sm text-fg-muted">
                Could not load your notifications.
              </p>
            ) : items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-fg-muted">
                Nothing here yet — when someone follows your channel or comments on your
                video, you&apos;ll see it here.
              </p>
            ) : (
              <ul className="flex flex-col">
                {items.map((n) => {
                  const { lead, rest, href } = describeNotification(n);
                  return (
                    <li key={n.id}>
                      <Link
                        href={href}
                        onClick={() => markReadQuietly(n)}
                        className={
                          "focus-ring flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-muted " +
                          (n.read ? "" : "bg-surface-muted")
                        }
                      >
                        <span
                          aria-hidden
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-strong/60 text-fg-muted"
                        >
                          <NotificationTypeIcon type={n.type} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="line-clamp-2 text-sm leading-normal text-fg">
                            <span className="font-semibold">{lead}</span>
                            {rest}
                          </span>
                          <span className="mt-0.5 text-xs text-fg-muted">
                            {relativeTime(n.created_at)}
                          </span>
                        </span>
                        {n.read ? null : (
                          <span
                            aria-hidden
                            className="mt-2 h-[7px] w-[7px] shrink-0 rounded-full bg-fg"
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-border-subtle p-2">
            <Link
              href="/notifications"
              className="focus-ring flex items-center justify-center rounded-xl px-3 py-2.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
            >
              See all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
