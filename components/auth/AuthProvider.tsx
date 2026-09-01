"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  authApi,
  restoreSession,
  setAccessToken,
  setSessionExpiredHandler,
} from "@/lib/api";
import type {
  AuthResponse,
  ClaimOwnerRequest,
  LoginCredentials,
  RegisterRequest,
  UpdateProfileRequest,
  User,
} from "@/lib/api";

/**
 * "restoring" — the boot-time silent refresh is still in flight (views should
 * treat it as loading, not signed-out); "anon" / "authed" — the settled states.
 */
type SessionStatus = "restoring" | "anon" | "authed";

/**
 * Outcome of a register call: "created" — the account exists and the session is
 * live; "pending" — the instance requires approval, a request was filed and
 * nobody is signed in; "verification_pending" — the account exists but is held
 * behind the email-verification gate (W7): no session until the emailed link
 * is confirmed.
 */
export type RegisterOutcome = "created" | "pending" | "verification_pending";

/**
 * Outcome of a login call: "authed" — the session is live; "mfa_required" —
 * the credentials were valid but the account has two-factor authentication
 * enabled, so NO session exists yet. Present `mfaToken` (valid 5 minutes)
 * together with a TOTP or recovery code to completeMfaChallenge.
 */
export type LoginOutcome =
  | { status: "authed" }
  | { status: "mfa_required"; mfaToken: string };

interface SessionContextValue {
  user: User | null;
  status: SessionStatus;
  /** Credentials name the account by `identifier` (email or username) or the legacy `email`. */
  login: (credentials: LoginCredentials) => Promise<LoginOutcome>;
  /** Second half of a two-factor login (TOTP or recovery code). */
  completeMfaChallenge: (mfaToken: string, code: string) => Promise<void>;
  register: (input: Omit<RegisterRequest, "cookie_mode">) => Promise<RegisterOutcome>;
  /**
   * First-run owner claim: redeem the server's boot-logged setup token for the
   * owner account. The 201 body IS an AuthResponse, so the session lands
   * through exactly the same seam as a login.
   */
  claimOwner: (input: Omit<ClaimOwnerRequest, "cookie_mode">) => Promise<void>;
  updateProfile: (input: UpdateProfileRequest) => Promise<void>;
  deactivate: (password: string) => Promise<void>;
  /** IRREVERSIBLE hard delete (password re-confirmed); clears the local session. */
  deleteAccount: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * "Sign out everywhere": revokes every session of the account server-side and
   * clears the local one. Rejects (leaving the local session intact) when the
   * revoke fails — the other devices are still signed in, so the UI must not
   * imply otherwise.
   */
  logoutEverywhere: () => Promise<void>;
  /** Re-fetch the current account (e.g. after email verification flips a flag). */
  reloadUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// Refresh access tokens before they expire so an idle signed-in browser session
// stays warm even while the user is only browsing public pages.
const ACCESS_REFRESH_LEAD_MS = 2 * 60 * 1000;
const MIN_ACCESS_REFRESH_DELAY_MS = 1000;
const PROACTIVE_REFRESH_RETRY_MS = 30 * 1000;

function proactiveRefreshDelayMs(expiresInSeconds: number): number | null {
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) return null;
  const ttlMs = expiresInSeconds * 1000;
  const leadMs = Math.min(ACCESS_REFRESH_LEAD_MS, Math.max(5000, ttlMs / 5));
  return Math.max(MIN_ACCESS_REFRESH_DELAY_MS, Math.floor(ttlMs - leadMs));
}

// AuthProvider holds the session client-side: the access token lives in the
// in-memory auth-store (auto-attached by the API client) and the user in React
// state. The refresh token is an httpOnly cookie the JS never sees, so a hard
// reload rehydrates via one silent POST /auth/refresh on boot — success loads
// /auth/me, failure quietly lands signed out (no error UI).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restored, setRestored] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionGenerationRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const scheduleRefreshRef = useRef<(expiresInSeconds: number, generation?: number) => void>(
    () => {},
  );

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback(
    (expiresInSeconds: number, generation = sessionGenerationRef.current) => {
      clearRefreshTimer();
      const delay = proactiveRefreshDelayMs(expiresInSeconds);
      if (delay === null) return;

      const runRefresh = async () => {
        const res = await restoreSession();
        if (generation !== sessionGenerationRef.current) return;
        if (!sessionActiveRef.current) {
          setAccessToken(null);
          return;
        }
        if (res) {
          scheduleRefreshRef.current(res.expires_in, generation);
          return;
        }

        // A transient network miss should not immediately sign the user out.
        // Keep the stale token in place; the existing 401 retry path remains
        // the final authority if the refresh cookie is truly gone.
        refreshTimerRef.current = setTimeout(() => {
          refreshTimerRef.current = null;
          void runRefresh();
        }, PROACTIVE_REFRESH_RETRY_MS);
      };

      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void runRefresh();
      }, delay);
    },
    [clearRefreshTimer],
  );

  useEffect(() => {
    scheduleRefreshRef.current = scheduleRefresh;
  }, [scheduleRefresh]);

  const clearLocalSession = useCallback(() => {
    sessionGenerationRef.current += 1;
    sessionActiveRef.current = false;
    clearRefreshTimer();
    setAccessToken(null);
    setUser(null);
  }, [clearRefreshTimer]);

  useEffect(() => {
    let cancelled = false;
    // An unrecoverable 401 mid-session (refresh failed, or a retried request
    // was still unauthorized) drops the UI to signed-out everywhere.
    setSessionExpiredHandler(clearLocalSession);

    void (async () => {
      const res = await restoreSession();
      if (cancelled) return;
      if (res) {
        sessionGenerationRef.current += 1;
        sessionActiveRef.current = true;
        scheduleRefresh(res.expires_in, sessionGenerationRef.current);
        // Prefer a fresh /auth/me read (role/verification may have changed
        // since the token was minted); fall back to the refresh payload's
        // user so a transient /me failure doesn't drop a valid session.
        try {
          const me = await authApi.me();
          if (!cancelled) setUser(me);
        } catch {
          if (!cancelled) setUser(res.user);
        }
      }
      if (!cancelled) setRestored(true);
    })();

    return () => {
      cancelled = true;
      sessionGenerationRef.current += 1;
      sessionActiveRef.current = false;
      clearRefreshTimer();
      setSessionExpiredHandler(null);
    };
  }, [clearLocalSession, clearRefreshTimer, scheduleRefresh]);

  const apply = useCallback((res: AuthResponse) => {
    // Cookie mode: the response body has no refresh_token — the httpOnly
    // cookie set by the backend is the sole carrier. Only the short-lived
    // access token is kept, in memory.
    sessionGenerationRef.current += 1;
    sessionActiveRef.current = true;
    setAccessToken(res.token);
    setUser(res.user);
    scheduleRefresh(res.expires_in, sessionGenerationRef.current);
  }, [scheduleRefresh]);

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<LoginOutcome> => {
      const res = await authApi.login(credentials);
      // An MFA-enabled account answers {mfa_required, mfa_token} with NO
      // session tokens — the caller must run the challenge step.
      if ("mfa_required" in res) {
        return { status: "mfa_required", mfaToken: res.mfa_token };
      }
      apply(res);
      return { status: "authed" };
    },
    [apply],
  );

  const completeMfaChallenge = useCallback(
    async (mfaToken: string, code: string) => {
      apply(await authApi.completeMFAChallenge(mfaToken, code));
    },
    [apply],
  );

  const register = useCallback(
    async (input: Omit<RegisterRequest, "cookie_mode">): Promise<RegisterOutcome> => {
      const res = await authApi.register(input);
      // A 202 means no session was issued: the signup awaits admin approval
      // ("pending") or the account is held behind the email-verification gate
      // ("verification_pending", W7) — the body's status says which.
      if (!res || !("token" in res)) {
        return res && "status" in res && res.status === "verification_pending"
          ? "verification_pending"
          : "pending";
      }
      apply(res);
      return "created";
    },
    [apply],
  );

  const claimOwner = useCallback(
    async (input: Omit<ClaimOwnerRequest, "cookie_mode">) => {
      // Identical to login's landing: `apply` holds the access token in memory,
      // adopts the returned user, and schedules the proactive refresh — the
      // owner is signed in the moment the claim succeeds, with no second round
      // trip through the credentials form.
      apply(await authApi.claimOwner(input));
    },
    [apply],
  );

  const updateProfile = useCallback(async (input: UpdateProfileRequest) => {
    setUser(await authApi.updateMe(input));
  }, []);

  const reloadUser = useCallback(async () => {
    setUser(await authApi.me());
  }, []);

  const deactivate = useCallback(async (password: string) => {
    await authApi.deactivate(password);
    // The backend already revoked every session; drop the local one too.
    clearLocalSession();
  }, [clearLocalSession]);

  const deleteAccount = useCallback(async (password: string) => {
    await authApi.deleteAccount(password);
    // The account is gone and every session revoked server-side; drop the
    // local session so the UI lands signed out immediately.
    clearLocalSession();
  }, [clearLocalSession]);

  const logoutEverywhere = useCallback(async () => {
    // Deliberately NOT wrapped in try/catch: a failed revoke must surface to
    // the caller with the session still live, or "signed out everywhere" would
    // be a lie. On success the backend has revoked this session too, so the
    // local one goes through the same seam deactivate/deleteAccount use.
    await authApi.logoutAll();
    clearLocalSession();
  }, [clearLocalSession]);

  const logout = useCallback(async () => {
    clearLocalSession();
    try {
      // Cookie-mode revoke: the request carries the httpOnly cookie (no body
      // token) and the 204 clears it, so a reload stays signed out.
      await authApi.logout();
    } catch {
      // Best-effort revoke; logout is idempotent server-side.
    } finally {
      setAccessToken(null);
    }
  }, [clearLocalSession]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      status: user ? "authed" : restored ? "anon" : "restoring",
      login,
      completeMfaChallenge,
      register,
      claimOwner,
      updateProfile,
      deactivate,
      deleteAccount,
      logout,
      logoutEverywhere,
      reloadUser,
    }),
    [
      user,
      restored,
      login,
      completeMfaChallenge,
      register,
      claimOwner,
      updateProfile,
      deactivate,
      deleteAccount,
      logout,
      logoutEverywhere,
      reloadUser,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within <AuthProvider>");
  }
  return ctx;
}

/**
 * useOptionalSession returns the session context, or null when there is no
 * AuthProvider above (never throws). For components that render both inside the
 * app shell and standalone — e.g. SearchResults, mounted under AuthProvider in
 * the app but rendered bare in unit tests — where the absence of a session is a
 * valid "no signed-in user" answer, not a programming error.
 */
export function useOptionalSession(): SessionContextValue | null {
  return useContext(SessionContext);
}
