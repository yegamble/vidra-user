"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { AnalyticsConsent, type AnalyticsChoice } from "@/components/AnalyticsConsent";
import { analyticsPage, syncGoogleAnalytics } from "@/lib/google-analytics";

const key = "vidra.analytics-consent";
function consentStore() {
  let choice: AnalyticsChoice | null | undefined;
  let notify = () => {};
  const publish = (next: AnalyticsChoice | null) => {
    if (choice !== next) { choice = next; notify(); }
  };
  const read = () => {
    try {
      const raw = window.localStorage.getItem(key);
      publish(raw === "granted" || raw === "denied" ? raw : null);
    } catch { publish("denied"); }
  };
  return {
    snapshot: () => choice,
    subscribe(listener: () => void) {
      notify = listener;
      const storage = (event: StorageEvent) => { if (event.key === null || event.key === key) read(); };
      window.addEventListener("storage", storage);
      read(); // Subscription begins after mount; SSR and initial rendering read nothing.
      return () => { window.removeEventListener("storage", storage); notify = () => {}; };
    },
    write(next: AnalyticsChoice) {
      try { window.localStorage.setItem(key, next); publish(next); return true; }
      catch { publish("denied"); return false; }
    },
  };
}
const serverSnapshot = () => undefined;

export function GoogleAnalytics({ enabled, measurementId, nonce }: { enabled: boolean; measurementId: string; nonce: string }) {
  const pathname = usePathname() ?? "";
  const store = useMemo(() => consentStore(), []);
  const choice = useSyncExternalStore(store.subscribe, store.snapshot, serverSnapshot);
  const privacyBlocked = choice !== undefined && (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true);
  const eligible = enabled && /^G-[A-Z0-9]{4,20}$/.test(measurementId) && analyticsPage(pathname) !== null && !privacyBlocked;
  useEffect(() => {
    syncGoogleAnalytics(eligible && choice === "granted" ? measurementId : null, pathname, nonce);
    // No cleanup reset: StrictMode replay and ordinary navigation share the tag.
  }, [choice, eligible, measurementId, nonce, pathname]);
  const change = (next: AnalyticsChoice) => {
    if (next === "denied") syncGoogleAnalytics(null, pathname, nonce);
    if (!store.write(next)) syncGoogleAnalytics(null, pathname, nonce);
  };
  return choice === undefined || !eligible ? null : <AnalyticsConsent choice={choice} onChange={change} />;
}
