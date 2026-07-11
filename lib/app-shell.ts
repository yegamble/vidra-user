/**
 * Routes that deliberately render without the global browsing chrome.
 *
 * Embeds need a bare player for third-party pages. Authentication and account
 * recovery flows need one clear task and their own home-linked wordmark, so the
 * app header, primary sidebar, and phone tab bar step aside there too.
 */
const STANDALONE_ROUTE_PREFIXES = [
  "/embed",
  "/login",
  "/signup",
  "/reset-password",
  "/verify-email/confirm",
] as const;

export function isStandaloneRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return STANDALONE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
