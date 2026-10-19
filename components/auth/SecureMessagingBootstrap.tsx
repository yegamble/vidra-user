"use client";
import { useEffect } from "react";
import { useSession } from "./AuthProvider";
import { prepareDevice } from "@/lib/e2ee/prepare";
import { useInstanceFeatures } from "@/lib/instance-features";

export function SecureMessagingBootstrap() {
  const { status, user } = useSession();
  const features = useInstanceFeatures();
  // Older instances retain thread-level setup; only an explicit disclosure
  // enables background registration while browsing other parts of the app.
  const enabled = features?.messaging !== false && features?.messaging_e2ee === true;
  useEffect(() => {
    if (status !== "authed" || !user || !enabled) return;
    let active = true;
    let busy = false;
    let lastAttempt = 0;
    const prepare = async (force = false) => {
      if (!active || busy || document.visibilityState === "hidden") return;
      if (!force && Date.now() - lastAttempt < 30_000) return;
      busy = true;
      lastAttempt = Date.now();
      await prepareDevice().catch(() => {}); // Thread entry exposes recovery UI.
      busy = false;
    };
    const focus = () => { void prepare(); };
    const online = () => { void prepare(true); };
    void prepare();
    window.addEventListener("focus", focus);
    window.addEventListener("online", online);
    return () => {
      active = false;
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", online);
    };
  }, [status, user?.id, enabled]);
  return null;
}
