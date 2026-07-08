"use client";

import { LoaderIcon, WarningIcon } from "@/components/icons";

// A media-overlay pill button (white / translucent-white on the black scrim —
// the sanctioned theme-invariant exception, matching the design's IPFS state).
const SOLID_PILL =
  "focus-ring rounded-full bg-white px-4 py-2 text-[13px] font-bold text-black transition-opacity hover:opacity-90";
const GHOST_PILL =
  "focus-ring rounded-full bg-white/15 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-white/25";

/**
 * IpfsPlayerOverlay — the fetching / error surface painted over the watch player
 * while an IPFS playback attempt is in flight or has failed (DR5). Peer-free copy
 * per spec §5.1 (the backend exposes no peer counts). WatchView owns the state
 * and hands this to VideoPlayer's `overlay` slot; it covers the video and the
 * controls (the server source keeps working underneath the error state, which
 * "Play from server" reveals).
 */
export function IpfsPlayerOverlay({
  state,
  onRefetch,
  onUseServer,
}: {
  state: "fetching" | "error";
  onRefetch: () => void;
  onUseServer: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/65 px-8 text-center backdrop-blur-sm">
      {state === "fetching" ? (
        <>
          <LoaderIcon size={26} strokeWidth={2.4} className="animate-spin text-white" />
          <p className="text-[13px] text-white/80">Fetching from IPFS…</p>
        </>
      ) : (
        <>
          <WarningIcon size={28} strokeWidth={1.8} className="text-white/85" />
          <p className="text-[15px] font-semibold text-white">
            Couldn&apos;t retrieve this video from IPFS
          </p>
          <p className="max-w-xs text-[12.5px] leading-relaxed text-white/65">
            The IPFS gateway couldn&apos;t return this video right now.
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={onRefetch} className={SOLID_PILL}>
              Re-fetch from IPFS
            </button>
            <button type="button" onClick={onUseServer} className={GHOST_PILL}>
              Play from server
            </button>
          </div>
        </>
      )}
    </div>
  );
}
