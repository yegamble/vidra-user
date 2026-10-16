import { parseRemoteFollowTarget } from "@/lib/remote-follow";

// Pure helpers for remote interaction (T32): the OUTBOUND flow, where a
// signed-out visitor types their fediverse handle and is sent to their home
// server's subscribe page, and the INBOUND page /remote-interaction?uri=.
// The backend does the real work (SSRF-guarded WebFinger on the visitor's
// server); this only shapes input and refuses unsafe output.

export type InteractionKind = "channel" | "video";

/** "user@host" (leading @ tolerated), or null — a URL is not a handle. */
export function parseFediverseHandle(input: string): string | null {
  const target = parseRemoteFollowTarget(input);
  return target && "handle" in target && target.handle ? target.handle : null;
}

/** The ActivityPub id core serves for a local channel/video on this origin. */
export function interactionTarget(origin: string, kind: InteractionKind, id: string): string {
  return kind === "channel"
    ? `${origin}/video-channels/${encodeURIComponent(id)}`
    : `${origin}/videos/${encodeURIComponent(id)}`;
}

/**
 * safeSubscribeUrl admits only a plain https URL (no credentials) as a
 * navigation target. The URL comes from a third-party server by way of our
 * API, so it is validated again here before the browser follows it.
 */
export function safeSubscribeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname) return null;
    return value;
  } catch {
    return null;
  }
}

/** The ?uri= of the inbound page: an http(s) URL, else null. */
export function parseInteractionUri(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * browserSubscribeUrl is the fallback for instances that do not let signed-out
 * visitors trigger a server-side lookup: the visitor's OWN browser asks the
 * visitor's own server for its WebFinger document (Mastodon, PeerTube and
 * friends serve it with permissive CORS) and builds the subscribe URL itself.
 * The result gets the same https-only check as the server-resolved one.
 * Returns null on any failure (CORS refusal, network error, no template) so the
 * caller can show the manual instructions.
 */
export async function browserSubscribeUrl(
  handle: string,
  target: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const at = handle.lastIndexOf("@");
  const host = handle.slice(at + 1);
  try {
    // The host must be a bare host[:port]: it is spliced into a URL.
    const probe = new URL(`https://${host}`);
    if (probe.host !== host.toLowerCase() || probe.username || probe.password) return null;
    const res = await fetchImpl(
      `https://${host}/.well-known/webfinger?resource=${encodeURIComponent(`acct:${handle}`)}`,
      {
        headers: { Accept: "application/jrd+json, application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    const doc: unknown = await res.json();
    const links = (doc as { links?: unknown }).links;
    if (!Array.isArray(links)) return null;
    for (const l of links) {
      const link = l as { rel?: unknown; template?: unknown };
      if (
        link.rel === "http://ostatus.org/schema/1.0/subscribe" &&
        typeof link.template === "string" &&
        link.template.includes("{uri}")
      ) {
        return safeSubscribeUrl(link.template.split("{uri}").join(encodeURIComponent(target)));
      }
    }
  } catch {
    // CORS, DNS, timeout, bad JSON: all mean "ask the visitor to do it by hand".
  }
  return null;
}
