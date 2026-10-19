// In-memory access-token holder so apiRequest can attach the bearer token
// automatically. The token is NEVER persisted to localStorage/sessionStorage
// (per the observability/security spec) — across hard reloads the session is
// rehydrated via the httpOnly `vidra_refresh` cookie (see restoreSession in
// client.ts). The value never appears in any log line.
let accessToken: string | null = null;
let sessionEpoch = 0;
let sessionController = new AbortController();

// The app-level reaction to an unrecoverable 401 (refresh failed or the retried
// request was still unauthorized). AuthProvider registers a handler that clears
// the user state so the UI drops to signed-out everywhere.
let sessionExpiredHandler: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  const previous = sessionController;
  sessionEpoch += 1;
  accessToken = token;
  sessionController = new AbortController();
  previous.abort();
}

/** A login/logout boundary invalidates old work; token rotation keeps the epoch. */
export function captureAuthSession() {
  const epoch = sessionEpoch;
  return {
    epoch,
    signal: sessionController.signal,
    isCurrent: () => epoch === sessionEpoch,
    rotateToken(token: string): boolean {
      if (epoch !== sessionEpoch) return false;
      accessToken = token;
      return true;
    },
  };
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Register (or clear, with null) the handler run when the session expires. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

/** Drop the in-memory token and tell the app the session is gone. */
export function notifySessionExpired(): void {
  setAccessToken(null);
  sessionExpiredHandler?.();
}
