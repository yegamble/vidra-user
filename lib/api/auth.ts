import { apiRequest } from "./client";
import type {
  AuthResponse,
  EmailVerificationConfirmRequest,
  LoginRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RegisterRequest,
  RegistrationPending,
  UpdateProfileRequest,
  User,
} from "./types";

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
   * POST /api/v1/auth/register — create an account; returns a session (201).
   * When the instance requires registration approval no account is created:
   * the backend files a pending request and answers 202 {status:"pending"}.
   */
  register: (body: RegisterRequest) =>
    apiRequest<AuthResponse | RegistrationPending>("/api/v1/auth/register", {
      method: "POST",
      body: { ...body, cookie_mode: true },
      credentials: "include",
      retryOn401: false,
    }),

  /** POST /api/v1/auth/login — exchange credentials for a session. */
  login: (body: LoginRequest) =>
    apiRequest<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: { ...body, cookie_mode: true },
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
};
