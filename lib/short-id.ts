// Short share ids: a video's UUID re-encoded as base58 (the alphabet Bitcoin
// uses — no 0/O/I/l, so the id survives being read aloud or typed by hand).
// 36 hyphenated hex characters become at most 22, which is what makes
// `/v/<sid>` a link people will actually paste. It is a pure re-encoding of an
// id we already have: no backend field, no migration, and every existing video
// gets one for free. Pure + dependency-free so it unit-tests in the node
// environment and can be imported from a route handler or a client component.
// TWIN: a byte-compatible Go implementation lives in vidra-core internal/shortid — keep the golden vectors in both test suites identical.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 16 bytes never encode to more than 22 base58 characters (58^22 > 2^128), and
// never to fewer than 16 (all-zero bytes each cost one '1'). Bounding the
// length keeps a hostile URL from driving pointless BigInt work.
const MIN_LEN = 16;
const MAX_LEN = 22;
// Built with BigInt() rather than the `58n` literal: tsconfig targets ES2017,
// which has no bigint literal syntax (the runtime function is fine).
const ZERO = BigInt(0);
const BASE = BigInt(58);

/** uuidToShortId encodes a canonical UUID as a base58 short id, or null. */
export function uuidToShortId(id: string): string | null {
  if (!UUID_RE.test(id)) return null;
  const hex = id.replace(/-/g, "").toLowerCase();

  // Leading zero BYTES carry no magnitude, so they must be encoded positionally
  // as leading '1's — otherwise 00…01 and 01 would collide.
  let leadingZeros = 0;
  while (leadingZeros < 16 && hex.slice(leadingZeros * 2, leadingZeros * 2 + 2) === "00") {
    leadingZeros += 1;
  }

  let n = BigInt(`0x${hex}`);
  let out = "";
  while (n > ZERO) {
    out = ALPHABET[Number(n % BASE)] + out;
    n /= BASE;
  }
  return "1".repeat(leadingZeros) + out;
}

/** shortIdToUuid decodes a base58 short id back to a lowercase UUID, or null. */
export function shortIdToUuid(sid: string): string | null {
  // Callers hand us URL scraps — `searchParams.get()` and route params are
  // `string | null` — and reading `.length` off a non-string throws a
  // TypeError (a 500) instead of the null this function promises.
  if (typeof sid !== "string") return null;
  if (sid.length < MIN_LEN || sid.length > MAX_LEN) return null;

  let leadingZeros = 0;
  while (leadingZeros < sid.length && sid[leadingZeros] === "1") leadingZeros += 1;

  let n = ZERO;
  for (const ch of sid.slice(leadingZeros)) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) return null; // off-alphabet character (0, O, I, l, punctuation…)
    n = n * BASE + BigInt(digit);
  }

  let body = n === ZERO ? "" : n.toString(16);
  if (body.length % 2 === 1) body = `0${body}`;
  const hex = "00".repeat(leadingZeros) + body;
  if (hex.length !== 32) return null; // decoded to something that is not 16 bytes

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * shortWatchUrl returns the short alias for the canonical watch URL the browser
 * is currently showing, or null when the address bar should be left alone.
 *
 * The watch page is routed at /videos/{uuid} and stays that way: og:/oEmbed
 * metadata, the RSS guid and core's own URL parsing all key on it, and /v/{sid}
 * is a 301 alias back to it. What this supports is DISPLAY — the address bar
 * showing the 22-character link a viewer would actually paste instead of a raw
 * UUID. Every other route that renders a watch surface (embed, live, remote) is
 * left alone, and so is a path naming a different video, which is what the
 * browser still shows during the render-before-navigation window.
 */
export function shortWatchUrl(videoId: string, pathname: string, search: string): string | null {
  const sid = uuidToShortId(videoId);
  if (sid === null) return null;
  if (pathname !== `/videos/${videoId}`) return null;
  return `/v/${sid}${search}`;
}
