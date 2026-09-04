// The STORED short code: an opaque 11-character id the backend mints for every
// video (vidra-core migration 0126), and the identifier /v/{code} carries.
//
// It is NOT the derived sid in lib/short-id.ts. That one is a reversible
// re-encoding of a video's UUID and runs 16-22 characters; this one encodes
// nothing and is always exactly 11. They share an alphabet and a URL prefix,
// and are told apart by LENGTH — the two ranges do not overlap, which is what
// lets /v/ serve both without ambiguity.

import { ALPHABET } from "@/lib/short-id";

/** Exactly the length vidra-core's CHECK constraint enforces. */
export const SHORT_CODE_LENGTH = 11;

/**
 * isShortCode reports whether s is shaped like a stored short code.
 *
 * A shape check only — it says nothing about whether a video exists. The route
 * uses it to decide which of the two /v/ encodings it is looking at before
 * spending a backend round trip, and answers 404 for anything that is neither.
 */
export function isShortCode(s: string): boolean {
  if (s.length !== SHORT_CODE_LENGTH) return false;
  for (const ch of s) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}
