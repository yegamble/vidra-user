// Forward the viewer's IP on server-side reads of vidra-core.
//
// WHY THIS EXISTS. Every server-rendered read goes to INTERNAL_API_BASE_URL
// (http://api:8080) over the compose network, so from vidra-core's point of
// view the TCP peer of an SSR fetch is the frontend CONTAINER — not the viewer.
// Its per-IP rate limiter therefore buckets the entire internet under one key,
// and the instance starts answering 429 to server-rendered pages at roughly two
// renders/sec no matter who is browsing. Sending the real client IP splits that
// single bucket back into one per viewer.
//
// TRUST BOUNDARY. This header is only believable because the hop that carries
// it is the internal compose network — the api port is loopback-bound and only
// Caddy and this container can reach it. vidra-core pairs this with
//
//     e.IPExtractor = echo.ExtractIPFromXFFHeader(
//         echo.TrustLoopback(true), echo.TrustPrivateNet(true))
//
// which only honours X-Forwarded-For when the socket peer is itself loopback or
// RFC1918/ULA. A request arriving at vidra-core straight off the public
// internet is still keyed on its real socket address, so no viewer can promote
// themselves by inventing this header. Do NOT publish the api port publicly
// while this is in place.
//
// WHY WE FORWARD THE CHAIN VERBATIM. Echo's ExtractIPFromXFFHeader walks the
// list RIGHT-TO-LEFT and returns the first entry that is not a trusted
// (loopback/private) address. Caddy APPENDS the socket peer to whatever the
// client sent, so a viewer who supplies `X-Forwarded-For: 1.2.3.4` produces
// `1.2.3.4, <their real ip>` and Echo correctly reads the real address. Picking
// an element out of the chain ourselves — the leftmost one especially — would
// hand the limiter the spoofed value instead.

import { headers } from "next/headers";

const FORWARDED_FOR = "x-forwarded-for";

// Bound what we relay. The rightmost entries are the ones our own proxies
// appended, so when a chain is absurdly long we keep the tail and drop the
// client-supplied head rather than pass a header of unbounded size along.
const MAX_FORWARDED_HOPS = 8;

/**
 * Extra fetch headers that identify the viewer to vidra-core, or `{}` when the
 * viewer cannot be identified (no proxy in front of Next — the local `npm run
 * dev` and route-mocked e2e shape — or a request-less render context).
 *
 * Spread into a server-side fetch's `headers`, and ONLY into a per-request one:
 * see the "call sites deliberately skipped" note at the bottom of this file.
 */
export async function clientIpForwardHeaders(): Promise<Record<string, string>> {
  let incoming: string | null;
  try {
    incoming = (await headers()).get(FORWARDED_FOR);
  } catch {
    // headers() throws outside a request scope, and during a static prerender
    // it throws the DynamicServerError that opts the route into dynamic
    // rendering. Swallowing it here is safe *because this helper never changes
    // what is rendered* — the worst case is that a statically rendered route
    // forwards no IP, which is exactly today's behaviour. It is emphatically
    // not safe to add this helper to a call site whose route we then need to
    // stay static; see the skip list below.
    return {};
  }
  const chain = trustedForwardedSuffix(incoming);
  return chain === "" ? {} : { [FORWARDED_FOR]: chain };
}

/**
 * The longest suffix of `value` in which every entry parses as an IP address.
 *
 * Echo refuses the WHOLE header and falls back to the socket peer as soon as
 * one entry fails `net.ParseIP`. Since the head of the chain is client-supplied,
 * a viewer could otherwise send `X-Forwarded-For: junk` and drop themselves
 * back into the shared frontend-container bucket — a limiter bypass that also
 * degrades everyone else. Keeping only the proxy-appended suffix removes that
 * lever while leaving a well-formed chain untouched.
 */
export function trustedForwardedSuffix(value: string | null | undefined): string {
  if (!value) return "";
  const entries = value.split(",");
  const kept: string[] = [];
  for (let i = entries.length - 1; i >= 0 && kept.length < MAX_FORWARDED_HOPS; i--) {
    const entry = entries[i].trim();
    if (!isIpAddress(entry)) break;
    kept.unshift(entry);
  }
  return kept.join(", ");
}

// Mirrors what Go's net.ParseIP accepts, which is what Echo runs each entry
// through after stripping one layer of brackets.
function isIpAddress(value: string): boolean {
  const bare = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return isIpv4(bare) || looksLikeIpv6(bare);
}

function isIpv4(value: string): boolean {
  const octets = value.split(".");
  if (octets.length !== 4) return false;
  return octets.every(
    (octet) =>
      /^\d{1,3}$/.test(octet) &&
      Number(octet) <= 255 &&
      // Go rejects leading zeros (they read as octal elsewhere), so we do too.
      (octet.length === 1 || octet[0] !== "0"),
  );
}

// Shape-only, deliberately: an address that passes here but that Go rejects
// costs nothing beyond vidra-core falling back to the socket peer — today's
// behaviour — whereas rejecting a legitimate IPv6 viewer would silently keep
// them in the shared bucket. Covers the ::ffff:1.2.3.4 mapped form; excludes
// %zone suffixes, which net.ParseIP does not accept either.
function looksLikeIpv6(value: string): boolean {
  if (value.length > 45 || !/^[0-9a-fA-F:.]+$/.test(value)) return false;
  const groups = value.split(":");
  // Every IPv6 address has at least two colons ("::" is the shortest). The
  // one-colon check is what keeps "203.0.113.5:443" out — an XFF entry with a
  // port is not something net.ParseIP accepts, and letting it through would
  // void the whole chain on vidra-core's side.
  if (groups.length < 3 || groups.length > 9) return false;
  // Dots may only appear in a trailing embedded IPv4 (::ffff:203.0.113.5).
  const last = groups[groups.length - 1];
  if (groups.slice(0, -1).some((group) => group.includes("."))) return false;
  return !last.includes(".") || isIpv4(last);
}

// CALL SITES DELIBERATELY SKIPPED — do not "finish the job" by adding this to
// them:
//
//   lib/instance-config.server.ts, lib/instance-homepage.server.ts,
//   lib/video.server.ts, lib/featured.server.ts
//
// All four use `next: { revalidate: N }`. Their responses are shared across
// every viewer, and the Next data cache keys on the request headers — adding a
// per-viewer header would mint one cache entry per client IP, turning a fetch
// that fires once a minute into one that fires on every render. That is
// strictly worse for the limiter than the shared bucket it would be fixing, and
// reading headers() would drag `/videos/[id]`'s metadata pass dynamic as well.
// A cached fetch runs at most once per revalidation window, so it is not what
// exhausts the budget in the first place.
