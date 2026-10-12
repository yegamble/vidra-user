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
