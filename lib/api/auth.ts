import { apiBaseUrl } from "@/lib/config";

import { apiRequest } from "./client";
import type {
  AccountArchive,
  AccountExportStatus,
  AccountImportSummary,
  AuthResponse,
  ChangePasswordRequest,
  ClaimOwnerRequest,
  EmailChangeConfirmed,
  EmailChangeConfirmRequest,
  EmailChangeRequest,
  EmailChangeState,
  EmailVerificationConfirmRequest,
  LinkStartResponse,
  LoginRequest,
  MFARequiredResponse,
  MFAStatusResponse,
  OAuthIdentitiesResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RecoveryCodesResponse,
  RegisterRequest,
  RegistrationPending,
  SetPasswordRequest,
  StepUpStartRequest,
  StepUpStartResponse,
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
  completeMFAChallenge: (mfaToken: string | null, code: string) =>
    apiRequest<AuthResponse>("/api/v1/auth/mfa/challenge", {
      method: "POST",
      // A null token means the challenge came from a PROVIDER sign-in: the
      // callback could not hand a browser redirect a JSON token, so it parked
      // it in the httpOnly `vidra_mfa_pending` cookie the credentials below
      // carry back. Sending `mfa_token: null` would be a supplied-and-empty
      // token, which is a 422; omitting the field is what tells the server to
      // read the cookie.
      body: mfaToken === null
        ? { code, cookie_mode: true }
        : { mfa_token: mfaToken, code, cookie_mode: true },
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
   * POST /api/v1/auth/oauth/{provider}/link/start — connect an OIDC provider to
   * the SIGNED-IN account (bearer required). It exists because a provider's
   * word about an email address no longer links anything: an id_token whose
   * address matches an existing account is refused, so connecting a provider is
   * something the account holder does here, in a session.
   *
   * Runs with credentials included so the backend can seal the attempt into its
   * signed httpOnly state cookie, and returns the authorization URL. The caller
   * MUST hand off by a TOP-LEVEL browser navigation (window.location.assign) —
   * never fetch `authorization_url`. The callback lands back on `return_to`
   * with `?link=<provider>` or `?link_error=<code>`.
   *
   * 422 `provider_already_linked` when this account already has an identity for
   * the provider; 503 `oauth_not_configured` when the instance has none.
   */
  startOAuthLink: (provider: string, returnTo: string) =>
    apiRequest<LinkStartResponse>(
      `/api/v1/auth/oauth/${encodeURIComponent(provider)}/link/start`,
      { method: "POST", body: { return_to: returnTo }, credentials: "include", retryOn401: false },
    ),

  /**
   * POST /api/v1/auth/atproto/link/start — the Bluesky twin of the above. It
   * takes a handle, and because ATProto resolves its subject BEFORE the browser
   * leaves, a handle already connected to another account is refused right here
   * with 409 `identity_belongs_to_another_account` rather than after a consent
   * screen.
   */
  startATProtoLink: (handle: string, returnTo: string) =>
    apiRequest<LinkStartResponse>("/api/v1/auth/atproto/link/start", {
      method: "POST",
      body: { handle, return_to: returnTo },
      credentials: "include",
      retryOn401: false,
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
   * POST /api/v1/auth/verify-email/resend — re-send the verification message
   * for an address WITHOUT a session. It is the half the signed-in variant
   * above cannot cover: with the verification gate on, login answers 403
   * `email_verification_required`, so the account that lost the message has no
   * bearer token to ask with.
   *
   * Always 202 with an empty body — known, unknown, already-verified, and a
   * repeat inside the server's send cooldown all look identical — so the caller
   * must never render "we sent it" as a claim about the address existing.
   */
  resendEmailVerification: (body: { email: string }) =>
    apiRequest<void>("/api/v1/auth/verify-email/resend", { method: "POST", body }),

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

  /**
   * POST /api/v1/auth/logout-all — "sign out everywhere": revokes EVERY active
   * refresh-token session for the account, not just this browser's (204). The
   * bearer access token is the credential, so a stale one should silently
   * refresh and retry (retryOn401 left at its default) — unlike plain logout,
   * where the cookie is the credential and a 401 is a real answer. Cookies are
   * still included so the response's Max-Age=0 clears `vidra_refresh` here too.
   */
  logoutAll: () =>
    apiRequest<void>("/api/v1/auth/logout-all", {
      method: "POST",
      credentials: "include",
    }),

  /** GET /api/v1/auth/me — the current account (uses the stored bearer token). */
  me: () => apiRequest<User>("/api/v1/auth/me"),

  /** PATCH /api/v1/auth/me — update the current account's profile; returns it. */
  updateMe: (body: UpdateProfileRequest) =>
    apiRequest<User>("/api/v1/auth/me", { method: "PATCH", body }),

  /**
   * POST /api/v1/auth/me/password — change the signed-in account's password by
   * supplying the current one (bearer required). 204 on success, and every
   * OTHER session is revoked server-side — access tokens included, because they
   * are session-bound — while this session keeps working. 403 when the current
   * password is wrong, 409 when the account has no password at all
   * (OAuth/ATProto-only: use the reset flow), 422 on the password policy.
   */
  changePassword: (body: ChangePasswordRequest) =>
    apiRequest<void>("/api/v1/auth/me/password", { method: "POST", body }),

  /**
   * POST /api/v1/auth/me/password/set — give an account with NO password its
   * first one, authorised by a step-up assertion instead of a current password
   * (bearer required). 204, and every other session is revoked exactly as the
   * change does.
   *
   * It exists for the account shape that could not otherwise gain a second
   * sign-in method at all: created by Bluesky/OIDC sign-in, so passwordless,
   * and holding a synthetic `…@atproto.invalid` address the reset mail can
   * never reach. 403 `step_up_required` when the assertion is missing, spent,
   * expired, or from another session; 422 `password_already_set` when the
   * account has a password (use changePassword); 422 on the password policy.
   */
  setPassword: (body: SetPasswordRequest) =>
    apiRequest<void>("/api/v1/auth/me/password/set", { method: "POST", body }),

  /**
   * POST /api/v1/auth/step-up/start — begin a step-up re-authentication with a
   * provider already linked to the account (bearer required). Runs with
   * credentials included so the backend can seal the attempt into its signed
   * httpOnly state cookie, and returns the authorization URL.
   *
   * The caller MUST hand off by a TOP-LEVEL browser navigation
   * (window.location.assign) — never fetch `authorization_url`. The provider
   * callback lands back on `return_to` with `?step_up=<token>` (or
   * `?step_up_error=<code>`); spend that token on setPassword or
   * requestEmailChange within ten minutes, from this same session.
   *
   * 422 `step_up_provider_not_linked` when the provider is not one of the
   * caller's own; 503 `atproto_disabled` when the instance turned Bluesky
   * sign-in off.
   */
  startStepUp: (body: StepUpStartRequest) =>
    apiRequest<StepUpStartResponse>("/api/v1/auth/step-up/start", {
      method: "POST",
      body,
      credentials: "include",
    }),

  /**
   * POST /api/v1/auth/me/email-change — step one of the two-step address
   * change: re-verify the CURRENT password and have a single-use token mailed
   * to the NEW address (202). The account keeps its current address until that
   * token is confirmed. 403 wrong password, 409 either a password-less
   * (OAuth/ATProto-only) account or an address already in use on the instance,
   * 422 malformed or the address the account already has.
   */
  requestEmailChange: (body: EmailChangeRequest) =>
    apiRequest<EmailChangeState>("/api/v1/auth/me/email-change", { method: "POST", body }),

  /**
   * GET /api/v1/auth/me/email-change — the pending address change, if any.
   * Always 200: "nothing pending" is a state, not an error.
   */
  getEmailChange: (signal?: AbortSignal) =>
    apiRequest<EmailChangeState>("/api/v1/auth/me/email-change", { signal }),

  /**
   * POST /api/v1/auth/me/email-change/resend — re-send the confirmation for the
   * address already pending, superseding the previous token (202). No password:
   * the pending request already records that one was proven, and the message
   * can only go where that request said. 404 when nothing is pending.
   */
  resendEmailChange: () =>
    apiRequest<EmailChangeState>("/api/v1/auth/me/email-change/resend", { method: "POST" }),

  /**
   * DELETE /api/v1/auth/me/email-change — cancel the pending change and kill
   * its token (204). 404 when nothing was pending.
   */
  cancelEmailChange: () =>
    apiRequest<void>("/api/v1/auth/me/email-change", { method: "DELETE" }),

  /**
   * POST /api/v1/auth/me/email-change/confirm — spend the token from the
   * message and switch the address (200, returning the new one). Requires the
   * bearer token as well: the mail token proves the mailbox, the session proves
   * the account, and a token issued to a DIFFERENT account is refused exactly
   * like an unknown one (400).
   */
  confirmEmailChange: (body: EmailChangeConfirmRequest) =>
    apiRequest<EmailChangeConfirmed>("/api/v1/auth/me/email-change/confirm", {
      method: "POST",
      body,
    }),

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
