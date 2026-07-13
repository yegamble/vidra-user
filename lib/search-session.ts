// Anonymous, per-tab search/discovery session id.
//
// The search service correlates a user's autocomplete, submit, click, and watch
// events within a browsing session so it can learn (reformulations, co-clicks)
// WITHOUT tying them to an account for signed-out users. That correlation key is
// a random UUID minted here, stored in sessionStorage (so it lives for the tab's
// lifetime and dies when the tab closes — no cross-session tracking, nothing
// persistent), and sent to vidra-core as the `X-Vidra-Session` header on the
// search / recommendation / event calls only. It carries no PII: it is an opaque
// random id, and core — never the client — decides how it is used.
//
// SSR-safe: on the server there is no sessionStorage, so the getters no-op and
// return undefined; the header is simply omitted (the endpoints all tolerate a
// missing session).

const SESSION_KEY = "vidra.search-session";
export const SEARCH_SESSION_HEADER = "X-Vidra-Session";

/**
 * getSearchSessionId returns the current tab's search-session UUID, minting and
 * persisting one on first use. Returns undefined when there is no usable
 * sessionStorage (server render, or a privacy mode that throws) — callers then
 * simply omit the header. Never throws.
 */
export function getSearchSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // sessionStorage unavailable (SSR already handled, or storage disabled).
    return undefined;
  }
}

/**
 * searchSessionHeaders returns the header bag to spread into an apiRequest
 * `headers` option for a search/recommendation/event call: `{ "X-Vidra-Session":
 * <uuid> }`, or `{}` when no session id is available. Keeping this a helper means
 * every search call attaches the header the same way.
 */
export function searchSessionHeaders(): Record<string, string> {
  const id = getSearchSessionId();
  return id ? { [SEARCH_SESSION_HEADER]: id } : {};
}
