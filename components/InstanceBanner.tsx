"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";

import { CloseIcon, InfoIcon, WarningIcon } from "@/components/icons";
import { useT } from "@/components/I18nProvider";
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
import { useInstanceBroadcast } from "@/lib/instance-features";

// InstanceBanner is mounted in the root layout, but most instances do not have
// a broadcast. Keep react-markdown + remark-gfm out of every route's initial
// client bundle while retaining server rendering when a banner is present.
const Markdown = dynamic(() => import("@/components/Markdown").then((mod) => mod.Markdown));

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
// uses semantic status panels in both themes, distinct from neutral site chrome.
//
// Dismissal (broadcast.dismissable) persists in localStorage keyed by a hash
// of the message content, so an EDITED message re-shows the banner (PeerTube
// behavior). An inline pre-paint script (lib/broadcast.ts, the theme-bootstrap
// pattern) hides the SSR-rendered banner before first paint for visitors who
// already dismissed this exact message — no layout flash either way.

const LEVEL_STYLES: Record<BroadcastLevel, string> = {
  info: "border-info-border border-s-info bg-info-surface text-info",
  warning: "border-warning-border border-s-warning bg-warning-surface text-warning",
  error: "border-danger-border border-s-danger bg-danger-surface text-danger",
};

// nonce: the request CSP nonce (proxy.ts); the enforced policy blocks the
// dismiss script without it.
type Props = { instance: InstanceConfigSnapshot | null; nonce?: string };
export function InstanceBanner({ instance, nonce }: Props) {
  const pathname = usePathname();
  const live = useInstanceBroadcast();
  const broadcast = live ? live.broadcast : instance?.broadcast;
  const message = typeof broadcast?.message === "string" ? broadcast.message.trim() : "";
  if (pathname === "/embed" || pathname?.startsWith("/embed/")) return null;
  if (broadcast?.enabled !== true || message === "") return null;
  return (
    <BroadcastBanner
      message={message}
      level={normalizeBroadcastLevel(broadcast.level)}
      dismissable={broadcast.dismissable === true}
      nonce={nonce}
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
  nonce,
}: {
  message: string;
  level: BroadcastLevel;
  dismissable: boolean;
  nonce?: string;
}) {
  const t = useT();
  const hash = broadcastMessageHash(message);
  const [locallyDismissed, setLocallyDismissed] = useState<string | null>(null);
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
    setLocallyDismissed(hash);
    try {
      localStorage.setItem(BROADCAST_DISMISS_STORAGE_KEY, hash);
    } catch {
      // Storage unavailable: dismissal still works for this visit.
      return;
    }
    window.dispatchEvent(new Event(BROADCAST_DISMISS_EVENT));
  }, [hash]);

  // A stored dismissal only applies while the banner is still dismissable: if
  // the admin turns dismissable off without editing the message, it must
  // reappear for everyone.
  if ((dismissed || locallyDismissed === hash) && dismissable) return null;
  const Icon = level === "info" ? InfoIcon : WarningIcon;
  const label = t(level === "info" ? "announcement.label" : level === "warning" ? "announcement.warning" : "announcement.error");
  return (
    // suppressHydrationWarning: the pre-paint script may have set `hidden` on
    // the SSR element before React hydrates (same contract as data-theme on
    // <html>); the dismissal store above then unmounts the banner for real.
    <aside
      id={BROADCAST_BANNER_ID}
      role="region"
      aria-label={t("announcement.label")}
      data-level={level}
      suppressHydrationWarning
      className={cn("mx-4 mt-4 min-w-0 shrink-0 rounded-xl border border-s-4 px-4 py-4 sm:mx-6 sm:mt-6 sm:px-5", LEVEL_STYLES[level])}
    >
      <div className="flex items-start gap-3">
        <Icon size={22} strokeWidth={2} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <p className="mb-1 text-sm font-semibold leading-5">{label}</p>
          <Markdown className="[&_p]:text-base [&_p]:text-inherit [&_a]:text-inherit [&_ul]:text-base [&_ul]:text-inherit [&_ol]:text-base [&_ol]:text-inherit">{message}</Markdown>
        </div>
        {dismissable ? (
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("announcement.dismiss")}
            className="focus-ring -me-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-current/10"
          >
            <CloseIcon size={20} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {dismissable ? (
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: buildBroadcastDismissScript(hash) }} />
      ) : null}
    </aside>
  );
}
