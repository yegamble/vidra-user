"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  LoginRequest,
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
 * nobody is signed in.
 */
export type RegisterOutcome = "created" | "pending";

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
  login: (credentials: LoginRequest) => Promise<LoginOutcome>;
  /** Second half of a two-factor login (TOTP or recovery code). */
  completeMfaChallenge: (mfaToken: string, code: string) => Promise<void>;
  register: (input: RegisterRequest) => Promise<RegisterOutcome>;
  updateProfile: (input: UpdateProfileRequest) => Promise<void>;
  deactivate: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetch the current account (e.g. after email verification flips a flag). */
  reloadUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// AuthProvider holds the session client-side: the access token lives in the
// in-memory auth-store (auto-attached by the API client) and the user in React
// state. The refresh token is an httpOnly cookie the JS never sees, so a hard
// reload rehydrates via one silent POST /auth/refresh on boot — success loads
// /auth/me, failure quietly lands signed out (no error UI).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // An unrecoverable 401 mid-session (refresh failed, or a retried request
    // was still unauthorized) drops the UI to signed-out everywhere.
    setSessionExpiredHandler(() => setUser(null));

    void (async () => {
      const res = await restoreSession();
      if (cancelled) return;
      if (res) {
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
      setSessionExpiredHandler(null);
    };
  }, []);

  const apply = useCallback((res: AuthResponse) => {
    // Cookie mode: the response body has no refresh_token — the httpOnly
    // cookie set by the backend is the sole carrier. Only the short-lived
    // access token is kept, in memory.
    setAccessToken(res.token);
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (credentials: LoginRequest): Promise<LoginOutcome> => {
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
    async (input: RegisterRequest): Promise<RegisterOutcome> => {
      const res = await authApi.register(input);
      // A 202 means the instance requires approval: a pending request was filed
      // and there is no session to apply.
      if (!res || !("token" in res)) return "pending";
      apply(res);
      return "created";
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
    setAccessToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    setAccessToken(null);
    setUser(null);
    try {
      // Cookie-mode revoke: the request carries the httpOnly cookie (no body
      // token) and the 204 clears it, so a reload stays signed out.
      await authApi.logout();
    } catch {
      // Best-effort revoke; logout is idempotent server-side.
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      status: user ? "authed" : restored ? "anon" : "restoring",
      login,
      completeMfaChallenge,
      register,
      updateProfile,
      deactivate,
      logout,
      reloadUser,
    }),
    [
      user,
      restored,
      login,
      completeMfaChallenge,
      register,
      updateProfile,
      deactivate,
      logout,
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
