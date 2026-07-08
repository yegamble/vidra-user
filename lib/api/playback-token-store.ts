// In-memory holder for the short-lived, video-scoped playback tokens minted by
// POST /videos/{id}/unlock (CORE-17). Kept in module state ALONGSIDE the auth
// store (auth-store.ts) and, like the access token, NEVER persisted to
// localStorage/sessionStorage and NEVER logged: a leaked token would let anyone
// watch the password-protected video for the token's 6-hour life. The token is
// dropped when the viewer navigates away from the video (the watch/embed surface
// clears its entry on unmount / id change), so a shared tab does not carry an
// unlocked video forward.
//
// Keyed by video id so a session can hold tokens for more than one unlocked
// video at a time without them colliding.
const tokens = new Map<string, string>();

/** Remember the playback token minted for a video (replaces any prior one). */
export function setPlaybackToken(videoId: string, token: string): void {
  tokens.set(videoId, token);
}

/** The stored playback token for a video, or null when none has been minted. */
export function getPlaybackToken(videoId: string): string | null {
  return tokens.get(videoId) ?? null;
}

/** Drop a video's stored playback token (on navigate-away / unmount). */
export function clearPlaybackToken(videoId: string): void {
  tokens.delete(videoId);
}
