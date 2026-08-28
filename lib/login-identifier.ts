import type { LoginCredentials } from "@/lib/api";

/**
 * Mirrors vidra-core's `looksLikeEmail` (internal/httpapi/auth.go): exactly one
 * "@" with a non-empty local part, a non-empty domain, and a dot in the domain.
 * Deliberately lax — real deliverability is proven by the verification flow,
 * never by a regex — and deliberately IDENTICAL to the backend's rule, because
 * the two must agree on which request shape a given input produces.
 */
export function looksLikeEmail(value: string): boolean {
  const s = value.trim();
  const at = s.indexOf("@");
  if (at <= 0 || at !== s.lastIndexOf("@") || at === s.length - 1) return false;
  return s.slice(at + 1).includes(".");
}

/**
 * Shapes one sign-in input into a login body.
 *
 * Email-shaped input is sent as the legacy `email` field rather than
 * `identifier`. That is the whole point of the split: this frontend can deploy
 * BEFORE the backend that understands `identifier`, and email sign-in — the
 * only way anyone signs in today — keeps working against the old API instead of
 * 422-ing every user out. Anything else goes out as `identifier` and is a
 * username; against an old backend that fails, which is correct, since such a
 * backend has no username sign-in to offer.
 *
 * The value is passed through untrimmed except for the shape test: the server
 * trims, and trimming here would quietly "fix" a paste the user should see.
 */
export function loginCredentials(identifier: string, password: string): LoginCredentials {
  return looksLikeEmail(identifier)
    ? { email: identifier, password }
    : { identifier, password };
}
