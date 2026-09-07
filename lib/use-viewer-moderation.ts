"use client";

import { useEffect, useSyncExternalStore } from "react";

import { api } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import type { SettledSession } from "@/lib/use-settled-session";

/**
 * Who this viewer has muted or blocked — read once per settled session, shared
 * by every surface that has to act on it, and updated in place when the viewer
 * mutes or blocks from one of them.
 *
 * Two surfaces need it and they need different halves. The mute/block control
 * on a channel or profile page needs to know whether THIS account is already
 * muted or blocked, so the control can read "Unmute" rather than offering an
 * action the viewer has already taken. `SearchAutocomplete` needs the set of
 * channel HANDLES those accounts publish under: autocomplete is viewer-agnostic
 * on the server by design — vidra-search's index stores static eligibility and
 * never per-viewer state, which is what makes the ranked-ids contract
 * visibility-safe — so the client drops the suggestions naming a muted or
 * blocked account itself (A16 ruling). A suggestion carries only
 * `channel_handle`, which is why `MutedAccount`/`BlockedUser` carry
 * `channel_handles`: without it a client could resolve the owner of a suggested
 * handle only with a request per keystroke, which would be worse than the gap.
 *
 * ONE fetch of each list per settled session, cached at module scope and shared
 * across components (the header's search box and the channel page mount
 * together), so a keystroke costs nothing.
 */
export interface ViewerModeration {
  /**
   * True once both lists have been read for this viewer — or immediately for an
   * anonymous visitor, who has neither. False while they are in flight AND if
   * they failed: every consumer treats "not ready" as "hide nothing", so a
   * degraded read shows the viewer more than they asked for rather than
   * silently hiding a stranger's channel or mislabelling a control.
   */
  ready: boolean;
  /** Account ids the viewer has muted. */
  mutedIds: ReadonlySet<string>;
  /** Account ids the viewer has blocked. */
  blockedIds: ReadonlySet<string>;
  /**
   * Every channel handle owned by a muted or blocked account, lowercased —
   * handles are case-insensitive in the URL space and a suggestion may arrive
   * in any case.
   */
  hiddenChannelHandles: ReadonlySet<string>;
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

/**
 * The snapshot for a viewer whose lists are not (or not yet, or no longer)
 * known: nothing is hidden. A module constant rather than a fresh object,
 * because `useSyncExternalStore` compares snapshots by identity and a new Set
 * per render would re-run every effect that depends on this hook — including
 * the search box's fetch effect, which would then request on every render.
 */
const NOT_READY: ViewerModeration = {
  ready: false,
  mutedIds: EMPTY_IDS,
  blockedIds: EMPTY_IDS,
  hiddenChannelHandles: EMPTY_IDS,
};

/** An anonymous visitor mutes and blocks nobody, and never has to ask. */
const ANONYMOUS: ViewerModeration = { ...NOT_READY, ready: true };

/** viewerKey -> that viewer's lists. Only signed-in viewers ever get an entry. */
const byViewer = new Map<string, ViewerModeration>();
/** viewerKey -> the in-flight read, so two components mounting together share one. */
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshotFor(viewerKey: string): ViewerModeration {
  return byViewer.get(viewerKey) ?? NOT_READY;
}

function handlesOf(accounts: { channel_handles?: string[] }[]): string[] {
  return accounts.flatMap((a) => (a.channel_handles ?? []).map((h) => h.toLowerCase()));
}

async function load(viewerKey: string): Promise<void> {
  try {
    // Both lists, one round trip each. A single failure degrades BOTH halves —
    // a half-known set is worse than an unknown one, because a control would
    // then read "Mute" for an account the viewer has blocked.
    const [mutes, blocks] = await Promise.all([
      api.getMutedAccounts({ limit: FULL_LIST_LIMIT }),
      api.getBlockedUsers({ limit: FULL_LIST_LIMIT }),
    ]);
    byViewer.set(viewerKey, {
      ready: true,
      mutedIds: new Set(mutes.accounts.map((a) => a.user_id)),
      blockedIds: new Set(blocks.users.map((u) => u.user_id)),
      hiddenChannelHandles: new Set([...handlesOf(mutes.accounts), ...handlesOf(blocks.users)]),
    });
  } catch {
    // Degrade to "hide nothing" and do not retry on a loop: the entry stays
    // absent, and the next mount for this viewer asks once more.
  } finally {
    inFlight.delete(viewerKey);
    emit();
  }
}

/**
 * Record a mute/block change the viewer just made, so every surface reflects it
 * without a refetch — the channel page's own video list included.
 *
 * `channelHandles` is what the calling page knows the account publishes under
 * (a channel page knows one; a profile page knows all of them). It is additive:
 * unmuting drops only the handles the caller names, which can leave a stale
 * entry for a channel this session never saw. That is the safe direction — the
 * next session's read is exact, and the cost is one suggestion missing, never
 * one appearing that should not.
 */
export function recordViewerModeration(
  viewerKey: string,
  change: {
    userId: string;
    channelHandles?: string[];
    muted?: boolean;
    blocked?: boolean;
  },
): void {
  const current = byViewer.get(viewerKey);
  if (!current?.ready) return; // nothing known to update; the next read is exact
  const mutedIds = new Set(current.mutedIds);
  const blockedIds = new Set(current.blockedIds);
  if (change.muted !== undefined) {
    if (change.muted) mutedIds.add(change.userId);
    else mutedIds.delete(change.userId);
  }
  if (change.blocked !== undefined) {
    if (change.blocked) blockedIds.add(change.userId);
    else blockedIds.delete(change.userId);
  }
  const hidden = new Set(current.hiddenChannelHandles);
  const handles = (change.channelHandles ?? []).map((h) => h.toLowerCase());
  const stillHidden = mutedIds.has(change.userId) || blockedIds.has(change.userId);
  for (const h of handles) {
    if (stillHidden) hidden.add(h);
    else hidden.delete(h);
  }
  byViewer.set(viewerKey, { ready: true, mutedIds, blockedIds, hiddenChannelHandles: hidden });
  emit();
}

/** Test seam: drop every cached list (the module cache outlives a render tree). */
export function resetViewerModerationCache(): void {
  byViewer.clear();
  inFlight.clear();
  emit();
}

/**
 * useViewerModeration — the viewer's mute and block lists for a session the
 * CALLER has already settled.
 *
 * The session is a parameter rather than a hook call inside, because the two
 * halves of the codebase reach the session differently and both are right: a
 * surface that can never render outside `AuthProvider` uses `useSettledSession`,
 * while the header's search box and the server-rendered profile view use the
 * optional variant. Taking whichever one the caller already holds keeps this
 * hook out of that decision — and keeps it from adding a second, different
 * session read to a component that already has one.
 *
 * It waits for `settled` for the reason every viewer-scoped read in this repo
 * does: asking before the refresh cookie has been redeemed asks as an anonymous
 * visitor, and `GET /me/mutes/accounts` is `requireAuth`, so the answer would be
 * a 401 the effect never re-runs after.
 */
export function useViewerModeration(session: SettledSession): ViewerModeration {
  const { settled, authed, viewerKey } = session;
  const snapshot = useSyncExternalStore(
    subscribe,
    () => snapshotFor(viewerKey),
    () => NOT_READY, // the server renders no viewer's lists
  );

  useEffect(() => {
    if (!settled || !authed) return;
    if (byViewer.has(viewerKey) || inFlight.has(viewerKey)) return;
    inFlight.set(viewerKey, load(viewerKey));
  }, [settled, authed, viewerKey]);

  // An anonymous visitor has nothing to hide and nothing to ask for; returning
  // the shared constant (rather than the store's) keeps the identity stable, so
  // a consumer can put these sets straight into a dependency list.
  return authed ? snapshot : ANONYMOUS;
}
