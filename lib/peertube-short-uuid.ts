// Decoder for a PeerTube shortUUID — the identifier in an imported instance's
// /w/{shortUUID} links.
//
// DECODE ONLY, and deliberately not shared with lib/short-id.ts. PeerTube uses
// the `short-uuid` package, whose default alphabet is flickrBase58: the SAME 58
// characters as the Bitcoin alphabet in short-id.ts, in a DIFFERENT ORDER
// (lowercase before uppercase). Feeding one to the other's decoder does not
// error — it silently yields a different, wrong uuid. Verified against
// short-uuid 6.0.3: 6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b encodes to
// EjArDZ8v19uX6BigXbAx5p here and eJaRdy8V19Uw6bHFwAaX5P there.
//
// This lives in the frontend only. vidra-core never needs it: the importer
// already holds the source uuid and stores it on the video, so core resolves by
// uuid and no PeerTube encoding crosses the API boundary.

// flickrBase58, exactly as short-uuid's constants define it.
const FLICKR = "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

// short-uuid pads to a fixed width with alphabet[0] ("1") because its default
// config is consistentLength: true, and maxLength for a 58-character alphabet is
// ceil(128 / log2(58)) = 22. So a PeerTube shortUUID is ALWAYS exactly 22
// characters — never fewer, however small the uuid.
const LENGTH = 22;

/**
 * peertubeShortUUIDToUUID decodes a PeerTube shortUUID to the uuid it names, or
 * null when the input is not one.
 *
 * Returning null rather than throwing keeps the route's contract simple: a
 * caller hands over a URL scrap and gets either a uuid or a 404.
 */
export function peertubeShortUUIDToUUID(sid: string): string | null {
  if (typeof sid !== "string" || sid.length !== LENGTH) return null;

  let n = BigInt(0);
  const base = BigInt(FLICKR.length);
  for (const ch of sid) {
    const digit = FLICKR.indexOf(ch);
    if (digit < 0) return null; // off-alphabet
    n = n * base + BigInt(digit);
  }

  const hex = n.toString(16).padStart(32, "0");
  // A value too large to be 16 bytes is not a uuid, however well-formed it
  // looked: 58^22 exceeds 2^128, so the top of the range is unreachable.
  if (hex.length !== 32) return null;

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
