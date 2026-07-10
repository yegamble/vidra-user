// Encrypted-message drafts are a one-navigation handoff between the inbox's
// New-message dialog and the encrypted thread composer. Keep them only in this
// JavaScript realm: plaintext must never be placed in a URL or browser storage.
const drafts = new Map<string, string>();

/** Hold a draft until the matching encrypted composer mounts. */
export function stashEncryptedDraft(conversationId: string, body: string): void {
  drafts.set(conversationId, body);
}

/**
 * Read without removing. This keeps React render retries from losing the draft;
 * the committed encrypted composer discards it immediately after mounting.
 */
export function readEncryptedDraft(conversationId: string): string | undefined {
  return drafts.get(conversationId);
}

/** Remove a handed-off draft so reopening the thread cannot replay it. */
export function discardEncryptedDraft(conversationId: string): void {
  drafts.delete(conversationId);
}

/** Test seam: isolate the module-level handoff between unit tests. */
export function __resetEncryptedDraftsForTest(): void {
  drafts.clear();
}
