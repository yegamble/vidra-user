// Broadcast banner support (config-parity W3; spec:
// .ralph/specs/config-parity/waves.md §W3). This module is deliberately free
// of "use client" so both the client banner component and unit tests can
// import it, and it owns the localStorage dismissal contract:
//
//   - Dismissal is keyed by a HASH of the message content (PeerTube
//     behavior): an admin editing the message re-shows the banner to
//     everyone, including visitors who dismissed the previous wording.
//   - The stored value is the hash of the last dismissed message; storing a
//     single slot (not a set) matches the single-broadcast registry model.
//   - buildBroadcastDismissScript() renders the tiny inline pre-paint script
//     (same pattern as lib/theme-bootstrap.ts): the SSR HTML always contains
//     the banner so anonymous visitors see it without a pop-in, and the
//     script hides it before first paint for visitors who already dismissed
//     this exact message — no flash in either direction.

export const BROADCAST_DISMISS_STORAGE_KEY = "vidra.broadcast.dismissed";

/**
 * Fired on window after a same-tab dismissal is stored ("storage" events only
 * fire in OTHER tabs), so every banner store subscriber re-reads.
 */
export const BROADCAST_DISMISS_EVENT = "vidra:broadcast-dismissed";

/** Whether THIS message (by content hash) has been dismissed in this browser. */
export function isBroadcastDismissed(hash: string): boolean {
  try {
    return localStorage.getItem(BROADCAST_DISMISS_STORAGE_KEY) === hash;
  } catch {
    // Storage unavailable (private mode): the banner simply shows.
    return false;
  }
}

/** The banner element id the pre-paint dismiss script targets. */
export const BROADCAST_BANNER_ID = "broadcast-banner";

export type BroadcastLevel = "info" | "warning" | "error";

/** Contract enum with a safe fallback: anything unknown renders as info. */
export function normalizeBroadcastLevel(level: string | undefined): BroadcastLevel {
  return level === "warning" || level === "error" ? level : "info";
}

/**
 * A stable content hash of the broadcast message (FNV-1a 32-bit, hex). Not
 * cryptographic — it only needs to change when the message changes so an
 * edited announcement re-shows past dismissers.
 */
export function broadcastMessageHash(message: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < message.length; i++) {
    hash ^= message.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The inline pre-paint script rendered INSIDE the (dismissable) banner: by
 * the time it runs the banner element precedes it in the document, so it can
 * hide it before first paint when this exact message was already dismissed.
 * Storage access is try-wrapped (private browsing) — on failure the banner
 * simply stays visible.
 */
export function buildBroadcastDismissScript(hash: string): string {
  return (
    `try{if(localStorage.getItem(${JSON.stringify(BROADCAST_DISMISS_STORAGE_KEY)})===${JSON.stringify(hash)})` +
    `{var b=document.getElementById(${JSON.stringify(BROADCAST_BANNER_ID)});if(b)b.hidden=true}}catch(e){}`
  );
}
