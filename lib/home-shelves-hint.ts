// Pre-paint space reservation for the signed-in "Shelves on Home" band
// (Continue watching + Following). That band is a client-only, authed-only
// surface (HomeShelves): it renders nothing during SSR, session restore, and
// the two authed fetches, then pops in above the sort chips + grid — an
// above-the-fold CLS source that shoves the whole feed down when it resolves.
//
// This module remembers how many shelves (0–2) a viewer saw last visit, so
// HomeShelves can paint that many skeleton shelves immediately and the real
// shelves swap in at the same height (no push-down). It mirrors the broadcast
// dismiss pre-paint pattern (lib/broadcast.ts): a localStorage slot + a tiny
// inline script that stamps a data-attribute on <html> before first paint + a
// useSyncExternalStore-friendly reader. Signed-out visitors always store 0, so
// an anonymous revisit reserves nothing (its layout is unchanged).

/** localStorage slot holding last visit's shelf count as a string "0".."2". */
export const HOME_SHELVES_HINT_STORAGE_KEY = "vidra:home-shelves-count";

/** The <html> attribute the pre-paint script stamps from that slot. */
export const HOME_SHELVES_HINT_ATTRIBUTE = "data-home-shelves";

/**
 * The marker attribute on the server-rendered slot that wraps <HomeShelves> in
 * app/page.tsx. The reservation CSS (app/globals.css) targets
 * `html[data-home-shelves="1"|"2"] [data-home-shelves-slot]:empty` to give the
 * slot the height of that many skeleton shelf bands at FIRST PAINT — before the
 * client-only HomeShelves hydrates and paints its own skeleton. The `:empty`
 * guard makes the reservation self-release the instant the slot fills, so the
 * skeleton (then the real band) holds the identical height with no shift. Kept
 * here beside HOME_SHELVES_HINT_ATTRIBUTE so the JSX, the CSS selector, and this
 * contract stay documented in one place.
 */
export const HOME_SHELVES_SLOT_ATTRIBUTE = "data-home-shelves-slot";

/**
 * Fired on window after a same-tab write ("storage" only fires in OTHER tabs),
 * so the useSyncExternalStore reader re-reads.
 */
export const HOME_SHELVES_HINT_EVENT = "vidra:home-shelves-hint";

/** The band renders at most two shelves (Continue watching + Following). */
export const MAX_HOME_SHELVES = 2;

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const n = Math.trunc(value);
  if (n < 0) return 0;
  if (n > MAX_HOME_SHELVES) return MAX_HOME_SHELVES;
  return n;
}

/** The remembered shelf count (0..2) for this browser; 0 when unknown. */
export function readHomeShelvesHint(): number {
  try {
    const raw = localStorage.getItem(HOME_SHELVES_HINT_STORAGE_KEY);
    if (raw === null) return 0;
    return clampCount(Number.parseInt(raw, 10));
  } catch {
    // Storage unavailable (private mode): reserve nothing.
    return 0;
  }
}

/**
 * Remember how many shelves rendered this visit, mirror it onto the <html>
 * data-attribute (so the NEXT first paint can reserve space), and fire the
 * same-tab event so the reader re-reads. Every access is try-wrapped so a
 * missing storage/document/window is a silent no-op.
 */
export function writeHomeShelvesHint(count: number): void {
  const n = clampCount(count);
  try {
    localStorage.setItem(HOME_SHELVES_HINT_STORAGE_KEY, String(n));
  } catch {
    // Storage unavailable: no reservation next visit, nothing else to do.
  }
  try {
    document.documentElement.setAttribute(HOME_SHELVES_HINT_ATTRIBUTE, String(n));
  } catch {
    // No document (non-browser render): nothing to stamp.
  }
  try {
    window.dispatchEvent(new Event(HOME_SHELVES_HINT_EVENT));
  } catch {
    // No window: the reader simply keeps its last value.
  }
}

/**
 * The inline pre-paint script (theme-bootstrap / broadcast pattern): before
 * first paint, read the remembered count from localStorage and stamp it on
 * <html> as data-home-shelves. Storage access is try-wrapped (private
 * browsing) — on failure the attribute is simply absent and nothing reserves.
 */
export function buildHomeShelvesHintScript(): string {
  return (
    `try{var n=localStorage.getItem(${JSON.stringify(HOME_SHELVES_HINT_STORAGE_KEY)});` +
    `if(n)document.documentElement.setAttribute(${JSON.stringify(HOME_SHELVES_HINT_ATTRIBUTE)},n)}catch(e){}`
  );
}

/** Subscribe to same-tab writes and cross-tab storage changes. */
export function subscribeHomeShelvesHint(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(HOME_SHELVES_HINT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(HOME_SHELVES_HINT_EVENT, onChange);
  };
}
