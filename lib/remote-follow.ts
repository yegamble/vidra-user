import type { CreateRemoteFollowRequest } from "@/lib/api";

// Pure input parsing for the "Follow a remote channel" form. The backend does
// the real resolution (WebFinger / actor fetch, SSRF-guarded) — this only maps
// what the user typed onto the contract's exactly-one-of handle/actor_url and
// rejects obvious non-targets locally so the form can show a helpful message
// without a round trip.

/**
 * parseRemoteFollowTarget turns user input into a POST /me/remote-follows body:
 * - "name@domain" (a leading @ is tolerated, PeerTube/Mastodon style) → handle
 * - an http(s) URL → actor_url
 * - anything else (empty, spaces, several @s, no domain) → null
 */
export function parseRemoteFollowTarget(input: string): CreateRemoteFollowRequest | null {
  const raw = input.trim();
  if (raw === "") return null;
  if (/^https?:\/\/\S+$/i.test(raw)) return { actor_url: raw };
  const handle = raw.replace(/^@/, "");
  // Exactly one @ separating a non-empty name and a plausible domain (a dot or
  // a :port — bare single-label hosts are almost always typos of a URL).
  if (/^[^@\s/]+@[^@\s/]+(?:\.[^@\s/]+|:\d+)$/.test(handle)) return { handle };
  return null;
}
