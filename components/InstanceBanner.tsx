"use client";

import { useCallback, useSyncExternalStore } from "react";

import { CloseIcon, InfoIcon, WarningIcon } from "@/components/icons";
import { Markdown } from "@/components/Markdown";
import {
  BROADCAST_BANNER_ID,
  BROADCAST_DISMISS_EVENT,
  BROADCAST_DISMISS_STORAGE_KEY,
  broadcastMessageHash,
  buildBroadcastDismissScript,
  isBroadcastDismissed,
  normalizeBroadcastLevel,
  type BroadcastLevel,
} from "@/lib/broadcast";
import { cn } from "@/lib/cn";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

// InstanceBanner — the root-layout banner slot (config-parity W2 seam), now
// carrying the W3 broadcast-message banner. It renders from the SSR instance
// snapshot, so:
//
//   - anonymous visitors get the banner in the initial HTML (no client fetch,
//     no pop-in, nothing blocks paint);
//   - the snapshot's ~60s revalidation window is the acceptable staleness;
//   - a null snapshot (backend unreachable / pre-W1 backend) renders nothing.
//
// The message body is markdown through the app's ONE sanitized renderer
// (components/Markdown.tsx — raw HTML never becomes elements). Level styling
// stays strictly inside the existing light-dark() tokens: info and warning
// ride the neutral surface with a level-toned icon, error uses the danger
// surface/border pair (the only status with a full surface set).
//
// Dismissal (broadcast.dismissable) persists in localStorage keyed by a hash
// of the message content, so an EDITED message re-shows the banner (PeerTube
// behavior). An inline pre-paint script (lib/broadcast.ts, the theme-bootstrap
// pattern) hides the SSR-rendered banner before first paint for visitors who
// already dismissed this exact message — no layout flash either way.

const LEVEL_STYLES: Record<BroadcastLevel, { wrapper: string; icon: string }> = {
  info: { wrapper: "border-border-subtle bg-surface-muted", icon: "text-fg-muted" },
  warning: { wrapper: "border-border-subtle bg-surface-muted", icon: "text-warning" },
  error: { wrapper: "border-danger-border bg-danger-surface", icon: "text-danger" },
};

export function InstanceBanner({ instance }: { instance: InstanceConfigSnapshot | null }) {
  const broadcast = instance?.broadcast;
  const message = typeof broadcast?.message === "string" ? broadcast.message.trim() : "";
  if (broadcast?.enabled !== true || message === "") return null;
  return (
    <BroadcastBanner
      message={message}
      level={normalizeBroadcastLevel(broadcast.level)}
      dismissable={broadcast.dismissable === true}
    />
  );
}

// The dismissal store: re-read localStorage when another tab dismisses
// ("storage") or this tab does (the custom event — "storage" never fires in
// the tab that wrote).
function subscribeToDismissals(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(BROADCAST_DISMISS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(BROADCAST_DISMISS_EVENT, onChange);
  };
}

function BroadcastBanner({
  message,
  level,
  dismissable,
}: {
  message: string;
  level: BroadcastLevel;
  dismissable: boolean;
}) {
  const hash = broadcastMessageHash(message);
  // localStorage as an external store: the server snapshot always shows the
  // banner (matching the pre-paint script's default); after hydration React
  // reconciles with the stored dismissal, and a dismissal in this or any
  // other tab hides it live.
  const dismissed = useSyncExternalStore(
    subscribeToDismissals,
    () => isBroadcastDismissed(hash),
    () => false,
  );

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(BROADCAST_DISMISS_STORAGE_KEY, hash);
    } catch {
      // Storage unavailable: nothing to persist, the banner stays.
      return;
    }
    window.dispatchEvent(new Event(BROADCAST_DISMISS_EVENT));
  }, [hash]);

  if (dismissed) return null;
  const styles = LEVEL_STYLES[level];
  const Icon = level === "info" ? InfoIcon : WarningIcon;
  return (
    // suppressHydrationWarning: the pre-paint script may have set `hidden` on
    // the SSR element before React hydrates (same contract as data-theme on
    // <html>); the dismissal store above then unmounts the banner for real.
    <aside
      id={BROADCAST_BANNER_ID}
      role="region"
      aria-label="Announcement"
      data-level={level}
      suppressHydrationWarning
      className={cn("border-b", styles.wrapper)}
    >
      <div className="mx-auto flex w-full max-w-screen-2xl items-start gap-3 px-4 py-2.5 sm:px-6">
        <Icon size={16} strokeWidth={2} className={cn("mt-1 shrink-0", styles.icon)} />
        <div className="min-w-0 flex-1 py-0.5">
          <Markdown className="gap-2">{message}</Markdown>
        </div>
        {dismissable ? (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="focus-ring -my-1 shrink-0 rounded-full p-1.5 text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
          >
            <CloseIcon size={16} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {dismissable ? (
        <script dangerouslySetInnerHTML={{ __html: buildBroadcastDismissScript(hash) }} />
      ) : null}
    </aside>
  );
}
