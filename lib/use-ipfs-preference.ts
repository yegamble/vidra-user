"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlaybackSessionState } from "./playback-session";

type Selection = { id: string; preferred: string | null | undefined; manual: "server" | "ipfs" | null };

/** The server decides eligibility and the exact IPFS master; never synthesize a filename. */
export function useIPFSPreference(id: string, enabled: boolean, hint: boolean, session: PlaybackSessionState) {
  const initial = useCallback((): Selection => ({ id, preferred: enabled && hint ? undefined : null, manual: null }), [id, enabled, hint]);
  const [selection, setSelection] = useState(initial);
  const active = selection.id === id ? selection : initial();
  const preferred = active.preferred;
  const available = enabled ? session.session?.ipfs_hls_url ?? null : null;
  useEffect(() => {
    if (!enabled || preferred !== undefined) return;
    const settle = (url: string | null) => setSelection((previous) => ({
      ...(previous.id === id ? previous : initial()), preferred: url,
    }));
    if (session.status !== "pending") { settle(available); return; }
    // Only a detail that already advertises an eligible mirror earns this short
    // wait. Once CDN starts, a late session must not replace working playback.
    const timer = setTimeout(() => settle(null), 500);
    return () => clearTimeout(timer);
  }, [id, enabled, preferred, session.status, available, initial]);
  const select = useCallback((source: "server" | "ipfs") => {
    if (source === "ipfs" && !available) return;
    setSelection((previous) => ({ ...(previous.id === id ? previous : initial()), manual: source }));
  }, [id, available, initial]);
  return {
    url: enabled ? active.manual === "server" ? null : active.manual === "ipfs" ? available : preferred ?? null : null,
    available,
    waiting: enabled && active.manual === null && preferred === undefined,
    select,
  };
}
