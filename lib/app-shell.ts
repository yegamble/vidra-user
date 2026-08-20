/**
 * Routes that deliberately render without the global browsing chrome.
 *
 * Embeds need a bare player for third-party pages. Authentication and account
 * recovery flows need one clear task and their own home-linked wordmark, so the
 * app header, primary sidebar, and phone tab bar step aside there too — as does
 * the first-run owner wizard (/setup/claim), which is the same kind of single
 * focused task on a server that has nothing to browse yet.
 */
const STANDALONE_ROUTE_PREFIXES = [
  "/embed",
  "/login",
  "/signup",
  "/setup",
  "/reset-password",
  "/verify-email/confirm",
] as const;

export function isStandaloneRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return STANDALONE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
