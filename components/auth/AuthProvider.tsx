"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { authApi, setAccessToken } from "@/lib/api";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  User,
} from "@/lib/api";

type SessionStatus = "anon" | "authed";

/**
 * Outcome of a register call: "created" — the account exists and the session is
 * live; "pending" — the instance requires approval, a request was filed and
 * nobody is signed in.
 */
export type RegisterOutcome = "created" | "pending";

interface SessionContextValue {
  user: User | null;
  status: SessionStatus;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<RegisterOutcome>;
  updateProfile: (input: UpdateProfileRequest) => Promise<void>;
  deactivate: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetch the current account (e.g. after email verification flips a flag). */
  reloadUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// AuthProvider holds the session client-side: the access token lives in the
// in-memory auth-store (auto-attached by the API client), the refresh token +
// user live in React state. Nothing is persisted, so a reload signs out until
// refresh-token rehydration lands.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  const apply = useCallback((res: AuthResponse) => {
    setAccessToken(res.token);
    setRefreshToken(res.refresh_token);
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      apply(await authApi.login(credentials));
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
    setRefreshToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    const rt = refreshToken;
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    if (rt) {
      try {
        await authApi.logout(rt);
      } catch {
        // Best-effort revoke; logout is idempotent server-side.
      }
    }
  }, [refreshToken]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      status: user ? "authed" : "anon",
      login,
      register,
      updateProfile,
      deactivate,
      logout,
      reloadUser,
    }),
    [user, login, register, updateProfile, deactivate, logout, reloadUser],
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
