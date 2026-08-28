import { apiBaseUrl } from "@/lib/config";

import { apiRequest } from "./client";
import type {
  AccountArchive,
  AccountExportStatus,
  AccountImportSummary,
  AuthResponse,
  ClaimOwnerRequest,
  EmailVerificationConfirmRequest,
  LoginRequest,
  MFARequiredResponse,
  MFAStatusResponse,
  OAuthIdentitiesResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RecoveryCodesResponse,
  RegisterRequest,
  RegistrationPending,
  TOTPEnrollmentResponse,
  UpdateProfileRequest,
  User,
} from "./types";

/**
 * Login credentials carry EXACTLY ONE identifier field — the contract 422s a
 * body holding both — so this union is what callers should pass rather than
 * the generated shape, where both fields are independently optional.
 *
 * `identifier` accepts an email address OR a username. `email` is the legacy
 * email-only field and is still sent for email-shaped input, which keeps
 * sign-in working against a backend deployed before `identifier` existed.
 */
type LoginBody = Omit<LoginRequest, "cookie_mode">;
export type LoginCredentials =
  | (LoginBody & { email: string; identifier?: never })
  | (LoginBody & { identifier: string; email?: never });

/**
 * Typed wrappers for the vidra-core auth endpoints.
 *
 * Session endpoints run in COOKIE MODE: register/login send cookie_mode: true
 * with credentials included, so the rotating refresh token lives in an
 * httpOnly `vidra_refresh` cookie (never in JS-readable state) and the
 * response body omits it. Only these endpoints (plus refresh/logout) send
 * cookies; every other call is cookie-free. A 401 on them is a real answer,
 * so the client's silent-refresh retry is disabled (retryOn401: false).
 */
export const authApi = {
  /**
   * POST /api/v1/setup/claim-owner — first-run owner bootstrap: redeem the
   * boot-logged setup token for THE owner (admin) account. Unauthenticated by
   * design (the token IS the credential) and rate limited like login; answers
   * 201 with the same AuthResponse a login returns, so the owner lands signed
   * in. 403 `owner_claim_invalid` covers a wrong / spent / rotated token
   * (the token is re-minted on every restart while a claim is outstanding),
   * 409 a taken username or email, 422 field-level validation.
   *
   * Cookie mode like login/register: the rotating refresh token is delivered
   * as the httpOnly `vidra_refresh` cookie, never in JS-readable state. A 401
   * here would be a real answer, so the silent-refresh retry stays off.
   */
  claimOwner: (body: Omit<ClaimOwnerRequest, "cookie_mode">) =>
    apiRequest<AuthResponse>("/api/v1/setup/claim-owner", {
      method: "POST",
      body: { ...body, cookie_mode: true },
      credentials: "include",
      retryOn401: false,
    }),

  /**
   * POST /api/v1/auth/register — create an account; returns a session (201).
   * When the instance requires registration approval no account is created:
   * the backend files a pending request and answers 202 {status:"pending"}.
   */
  register: (body: Omit<RegisterRequest, "cookie_mode">) =>
    apiRequest<AuthResponse | RegistrationPending>("/api/v1/auth/register", {
      method: "POST",
      body: { ...body, cookie_mode: true },
      credentials: "include",
      retryOn401: false,
    }),

  /**
   * POST /api/v1/auth/login — exchange credentials for a session. The account
   * is named by exactly one of `identifier` (email OR username) or the legacy
   * `email`. For an MFA-enabled account valid credentials return
   * {mfa_required, mfa_token} with NO session tokens — finish at
   * completeMFAChallenge within 5 minutes.
   */
  login: (body: LoginCredentials) =>
    apiRequest<AuthResponse | MFARequiredResponse>("/api/v1/auth/login", {
      method: "POST",
      body: { ...body, cookie_mode: true },
      credentials: "include",
      retryOn401: false,
    }),

  /**
   * POST /api/v1/auth/mfa/challenge — second half of a two-factor login:
   * the login's mfa_token plus a 6-digit TOTP code (or one unused recovery
   * code, consumed on use) for the full session. Cookie mode like login; a
   * wrong/expired token and a wrong code are both 401.
   */
  completeMFAChallenge: (mfaToken: string, code: string) =>
    apiRequest<AuthResponse>("/api/v1/auth/mfa/challenge", {
      method: "POST",
      body: { mfa_token: mfaToken, code, cookie_mode: true },
      credentials: "include",
      retryOn401: false,
    }),

  /**
   * GET /api/v1/auth/mfa — whether TOTP two-factor auth is enabled for the
   * account and how many single-use recovery codes remain (auth).
   */
  getMFAStatus: (signal?: AbortSignal) =>
    apiRequest<MFAStatusResponse>("/api/v1/auth/mfa", { signal }),

  /**
   * POST /api/v1/auth/mfa/totp — start (or restart) TOTP enrollment (auth).
   * Returns the shared secret + otpauth:// URI EXACTLY ONCE; login is
   * unaffected until the enrollment is verified. 409 when already enabled.
   */
  beginTOTPEnrollment: () =>
    apiRequest<TOTPEnrollmentResponse>("/api/v1/auth/mfa/totp", { method: "POST" }),

  /**
   * POST /api/v1/auth/mfa/totp/verify — confirm the pending enrollment with
   * the first valid authenticator code: two-factor flips on and the 10
   * recovery codes are returned EXACTLY ONCE. 400 on a wrong code.
   */
  verifyTOTPEnrollment: (code: string) =>
    apiRequest<RecoveryCodesResponse>("/api/v1/auth/mfa/totp/verify", {
      method: "POST",
      body: { code },
    }),

  /**
   * DELETE /api/v1/auth/mfa/totp — turn two-factor auth off (auth). The
   * account password must be re-entered (403 when wrong); also cancels a
   * pending enrollment. 204 on success.
   */
  disableTOTP: (password: string) =>
    apiRequest<void>("/api/v1/auth/mfa/totp", { method: "DELETE", body: { password } }),

  /**
   * GET /api/v1/me/oauth-identities — the OIDC identities linked to the
   * account, oldest link first (auth).
   */
  listOAuthIdentities: (signal?: AbortSignal) =>
    apiRequest<OAuthIdentitiesResponse>("/api/v1/me/oauth-identities", { signal }),

  /**
   * DELETE /api/v1/me/oauth-identities/{provider} — unlink one provider
   * identity (auth, 204). 422 when it is the account's last sign-in method;
   * 404 when that provider is not linked.
   */
  unlinkOAuthIdentity: (provider: string) =>
    apiRequest<void>(`/api/v1/me/oauth-identities/${encodeURIComponent(provider)}`, {
      method: "DELETE",
    }),

  /**
   * POST /api/v1/auth/password-reset — start the reset flow. Always 202
   * (enumeration-safe): a matching active account is mailed a reset token
   * out-of-band; the response never reveals whether the email exists.
   */
  requestPasswordReset: (body: PasswordResetRequest) =>
    apiRequest<void>("/api/v1/auth/password-reset", { method: "POST", body }),

  /**
   * POST /api/v1/auth/password-reset/confirm — set a new password using the
   * single-use token from the reset message. 204 on success (all the account's
   * sessions are revoked server-side); 400 if the token is invalid/used/expired.
   */
  confirmPasswordReset: (body: PasswordResetConfirmRequest) =>
    apiRequest<void>("/api/v1/auth/password-reset/confirm", { method: "POST", body }),

  /**
   * POST /api/v1/auth/verify-email — send an email-verification message to the
   * signed-in account's own address (bearer required). Always 202; a no-op if the
   * account is already verified.
   */
  requestEmailVerification: () =>
    apiRequest<void>("/api/v1/auth/verify-email", { method: "POST" }),

  /**
   * POST /api/v1/auth/verify-email/confirm — mark the email verified using the
   * single-use token from the verification message (public — the link may be
   * followed while logged out). 204 on success; 400 if invalid/used/expired.
   */
  confirmEmailVerification: (body: EmailVerificationConfirmRequest) =>
    apiRequest<void>("/api/v1/auth/verify-email/confirm", { method: "POST", body }),

  /**
   * POST /api/v1/auth/logout — revoke the cookie-mode session (idempotent,
   * always 204). The body carries no token: the httpOnly `vidra_refresh`
   * cookie identifies the session, and the response clears it (Max-Age=0) so
   * the browser is left signed out across reloads.
   */
  logout: () =>
    apiRequest<void>("/api/v1/auth/logout", {
      method: "POST",
      body: {},
      credentials: "include",
      retryOn401: false,
    }),

  /** GET /api/v1/auth/me — the current account (uses the stored bearer token). */
  me: () => apiRequest<User>("/api/v1/auth/me"),

  /** PATCH /api/v1/auth/me — update the current account's profile; returns it. */
  updateMe: (body: UpdateProfileRequest) =>
    apiRequest<User>("/api/v1/auth/me", { method: "PATCH", body }),

  /**
   * POST /api/v1/auth/me/deactivate — disable the current account after
   * confirming its password. Revokes all sessions server-side (204).
   */
  deactivate: (password: string) =>
    apiRequest<void>("/api/v1/auth/me/deactivate", {
      method: "POST",
      body: { password },
    }),

  /**
   * DELETE /api/v1/auth/me — IRREVERSIBLE hard delete of the account after
   * re-confirming the password (403 when wrong). Owned channels/videos are
   * permanently removed, comments become "[deleted]" tombstones, per-user data
   * is erased, and all sessions are revoked (204).
   */
  deleteAccount: (password: string) =>
    apiRequest<void>("/api/v1/auth/me", { method: "DELETE", body: { password } }),

  /**
   * GET /api/v1/me/export — the caller's most recent export job's status.
   * 404 when no export was ever requested (or the expired archive was
   * already cleaned up).
   */
  getAccountExport: (signal?: AbortSignal) =>
    apiRequest<AccountExportStatus>("/api/v1/me/export", { signal }),

  /**
   * POST /api/v1/me/export — enqueue the export job (202 with the fresh
   * status). 409 while one is already pending/running; requesting again after
   * completion replaces the previous archive.
   */
  requestAccountExport: () =>
    apiRequest<AccountExportStatus>("/api/v1/me/export", { method: "POST" }),

  /**
   * GET /api/v1/me/export/download — the finished JSON archive. 409 while
   * still pending/running or after a failure, 410 once expired, 404 when
   * none exists.
   */
  downloadAccountExport: () => apiRequest<AccountArchive>("/api/v1/me/export/download"),

  /**
   * POST /api/v1/me/import — re-create the SAFE subsets of an account archive
   * (profile fields, playlists, local follows, notification prefs); returns
   * the per-category summary. 413 over the body limit, 422 when the body is
   * not a vidra account archive. Additive — never deletes existing data.
   */
  importAccountArchive: (archive: AccountArchive) =>
    apiRequest<AccountImportSummary>("/api/v1/me/import", { method: "POST", body: archive }),
};

/**
 * URL of GET /api/v1/auth/oauth/{provider} — the OIDC begin endpoint. It must
 * be reached by a TOP-LEVEL browser navigation (anchor/redirect, never fetch):
 * the backend answers 302 to the provider after sealing the attempt into a
 * signed httpOnly state cookie. `returnTo` must be a same-origin relative path
 * ("/..."); the callback lands the session server-side in cookie mode and
 * redirects the browser there (with ?oauth_error=<code> on failure).
 */
export function oauthBeginUrl(provider: string, returnTo?: string): string {
  const base = `${apiBaseUrl}/api/v1/auth/oauth/${encodeURIComponent(provider)}`;
  return returnTo ? `${base}?return_to=${encodeURIComponent(returnTo)}` : base;
}

/**
 * POST /api/v1/auth/atproto/start — begin the ATProto (Bluesky / any PDS)
 * identity login for a handle. Runs with credentials included so the backend
 * can seal the attempt (incl. its ephemeral DPoP key) into a signed httpOnly
 * `vidra_atproto_state` cookie (never in JS-readable state), and returns the
 * authorization URL. The caller MUST hand off by a TOP-LEVEL browser navigation
 * (window.location.assign) — never fetch `authorization_url`. `returnTo` is a
 * BARE same-origin relative path ("/login" / "/signup"): the backend callback
 * appends the ?oauth=1 landing marker itself (or ?oauth_error=<code> on
 * failure), unlike the OIDC flow where the frontend embeds the marker. A 401 is
 * a real answer here, never a stale access token, so the retry is disabled.
 */
export function beginATProtoLogin(
  handle: string,
  returnTo: string,
): Promise<{ authorization_url: string }> {
  return apiRequest<{ authorization_url: string }>("/api/v1/auth/atproto/start", {
    method: "POST",
    body: { handle, return_to: returnTo },
    credentials: "include",
    retryOn401: false,
  });
}
