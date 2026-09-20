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

/**
 * isAdminConsoleRoute — the admin routes where the GLOBAL app sidebar steps
 * aside for the dedicated desktop console rail (app/admin/layout.tsx →
 * AdminConsole), i.e. /admin/* viewed BY an admin. Non-admins never see the
 * console (only the page's "Administrators only" gate), so they keep the app
 * sidebar there.
 *
 * Shared by the Sidebar (which returns null here) and the header's Menu button
 * (which must not render as a control whose aria-controls target does not
 * exist — axe reports that as a critical aria-valid-attr-value violation, and a
 * button that toggles nothing is worse than no button).
 */
export function isAdminConsoleRoute(pathname: string | null, role: string | undefined): boolean {
  return pathname?.startsWith("/admin") === true && role === "admin";
}
