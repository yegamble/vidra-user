// First-run owner claim (productionization phase 1).
//
// A brand-new server has no accounts and nobody who can administer it. Rather
// than granting the admin role to whoever registers first (a land-grab anyone
// who finds the URL can win), vidra-core mints a one-time setup token at boot
// and prints it to the server's own log. Redeeming it at
// POST /api/v1/setup/claim-owner creates THE owner account and issues its
// session in the same breath.
//
// The frontend's whole job is routing and honesty:
//   - GET /instance reports `owner_claim_pending` while the server is waiting,
//     so surfaces can point at the wizard instead of a signup form that cannot
//     succeed (every signup path answers 403 `owner_claim_required` until the
//     claim lands);
//   - the wizard explains the one thing people get wrong — the token ROTATES on
//     every restart, so a token copied from an older log is already dead.
//
// This module is the shared vocabulary: pure, dependency-free, and unit tested
// so the page, the card, and the signup fallback can never drift apart.

/** Where the first-run wizard lives. */
export const OWNER_CLAIM_PATH = "/setup/claim";

/**
 * The wizard entered from a signup attempt that was turned away. The page reads
 * it to lead with "that is why you are here" instead of dropping the visitor
 * into a bare form.
 */
export const OWNER_CLAIM_FROM_SIGNUP = `${OWNER_CLAIM_PATH}?from=signup`;

/**
 * Stable backend code for a setup token that is wrong, already spent, or long
 * since rotated away — one non-probing answer for all three (403).
 */
export const OWNER_CLAIM_INVALID_CODE = "owner_claim_invalid";

/**
 * Stable backend code every signup path answers while the server still awaits
 * its owner (403 on register / OIDC / ATProto).
 */
export const OWNER_CLAIM_REQUIRED_CODE = "owner_claim_required";

/**
 * The one command that prints the CURRENT setup token. Shown verbatim in the
 * invalid-token state — the token is unrecoverable once its log line scrolls
 * away, and restarting the server mints a fresh one.
 *
 * Spelled out in its PRODUCTION form on purpose. A bare `docker compose` picks
 * up docker-compose.override.yml, which on a Vidra host is the DEVELOPMENT
 * overlay — the same foot-gun `vidra doctor` flags. Naming the prod files (and
 * the prod env file) reads the logs of the containers that are actually
 * serving, so the token it prints is the live one.
 */
export const OWNER_CLAIM_LOG_COMMAND =
  "docker compose -f docker-compose.yml -f docker-compose.prod.yml " +
  "--env-file env/production.env logs api | grep 'FIRST-RUN'";

/** The marker the server prints the token beside, so it can be searched for. */
export const OWNER_CLAIM_LOG_MARKER = "FIRST-RUN SETUP REQUIRED";

/** The subset of the instance document this feature reads. */
export type OwnerClaimSignal = { owner_claim_pending?: boolean } | null | undefined;

/**
 * True only when the server explicitly reports that it is waiting for its
 * owner. An absent field (a backend that predates the claim flow) and an
 * unreadable instance document both read as "not waiting", so no surface ever
 * invents a first-run state it cannot back up.
 */
export function isOwnerClaimPending(instance: OwnerClaimSignal): boolean {
  return instance?.owner_claim_pending === true;
}
