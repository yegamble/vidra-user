"use client";

// THE PLAYER'S FRONT DOOR — phase-4 delivery item 1 (video) and item 7 (live).
//
// One call before playback answers everything the player used to piece together
// from the video detail: which manifests exist, how they are packaged, which
// rungs there are, a session id to key quality telemetry on, and — only for a
// subject that cannot be played without one — a playback token. Both endpoints
// return the SAME object, carrying video_id or live_stream_id, so a player
// consumes a session the same way whichever it is playing.
//
// THE TOKEN IS CONDITIONAL, AND THAT IS THE POINT. A public video's session
// carries no `playback_token`, deliberately: any `?pt=` or Authorization header
// marks a media request CREDENTIALED server-side, and a credentialed request is
// forced to no-store and never redirected — so a token handed to every viewer
// would silently make every byte origin-only and delete the whole CDN/presign
// benefit. This module therefore never invents, defaults or back-fills a token:
// it forwards exactly what the server issued, into the existing in-memory
// playback-token store, and nothing when the server issued nothing.
//
// THE UNLOCK FLOW IS UNTOUCHED. Authorization on the session endpoint is
// identical to the media routes, so a password-protected video answers 401
// `password_required` here exactly as GET /videos/{id} does — and the watch and
// embed surfaces already render their unlock prompt from THAT call. A session
// failure of any kind, 401 included, simply leaves the player on the detail's
// own hls_url, which is what it played before this existed.

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { setPlaybackToken } from "@/lib/api/playback-token-store";
import type { PlaybackSession } from "@/lib/api/types";
import { logger } from "@/lib/logger";

/** Which endpoint answers: a video session or a live one. */
export type PlaybackSubject = "video" | "live";

export interface PlaybackSessionState {
  /**
   * - "pending"     — asked, no answer yet. The player waits: starting on the
   *                   detail's URL and swapping when the session lands would
   *                   restart the media element mid-load.
   * - "ready"       — the session answers the manifest question.
   * - "unavailable" — no session (never asked, refused, or the wait expired).
   *                   The player falls back to the detail and plays as before.
   */
  status: "pending" | "ready" | "unavailable";
  session: PlaybackSession | null;
}

/**
 * How long playback waits for a session before proceeding without one. The
 * session is on the critical path of every play now, so an API that hangs must
 * cost a bounded delay rather than the playback: at the deadline the request is
 * aborted, a late answer is ignored (swapping the source under a loading media
 * element is worse than not having the session at all), and the detail's URL is
 * used exactly as it was before this call existed.
 */
export const PLAYBACK_SESSION_WAIT_MS = 4_000;

const PENDING: PlaybackSessionState = { status: "pending", session: null };
const UNAVAILABLE: PlaybackSessionState = { status: "unavailable", session: null };

/**
 * usePlaybackSession opens the session for one subject. `kind` null (a federated
 * video, which this instance does not deliver and cannot broker) asks for
 * nothing and reports "unavailable" — every caller then behaves exactly as it
 * did before sessions existed.
 *
 * `token` is the video-scoped playback token an unlock already minted, forwarded
 * so a password-protected video can open its session at all. It is never
 * fabricated: a public video passes nothing.
 */
export function usePlaybackSession(
  kind: PlaybackSubject | null,
  id: string | null | undefined,
  token?: string | null,
): PlaybackSessionState {
  const wanted = Boolean(kind && id);
  const [state, setState] = useState<PlaybackSessionState>(wanted ? PENDING : UNAVAILABLE);

  // Adjust state during render when the SUBJECT changes (React's
  // "adjust state on prop change" pattern, as WatchView does for the same
  // reason): the same component stays mounted across /videos/[id] navigation, so
  // an effect-time reset would leave one render in which the previous video's
  // session answers for the new one.
  const key = `${kind ?? "none"}:${id ?? ""}`;
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setState(wanted ? PENDING : UNAVAILABLE);
  }

  useEffect(() => {
    if (!kind || !id) return;
    const controller = new AbortController();
    let settled = false;
    const settle = (next: PlaybackSessionState) => {
      if (settled) return;
      settled = true;
      setState(next);
    };
    const timer = setTimeout(() => {
      controller.abort();
      settle(UNAVAILABLE);
    }, PLAYBACK_SESSION_WAIT_MS);

    const request =
      kind === "video"
        ? api.createVideoPlaybackSession(id, token ?? undefined, controller.signal)
        : api.createLivePlaybackSession(id, controller.signal);

    request
      .then((session) => {
        clearTimeout(timer);
        // An answer that arrives after this player is gone (unmounted, or the
        // wait expired) is dropped whole — including its token. Writing one then
        // would land AFTER the navigate-away cleanup already ran and leave a
        // credential in the store for a video nobody is watching.
        if (settled || controller.signal.aborted) return;
        // Otherwise a token, when the server issued one, flows into the SAME
        // in-memory store the unlock flow uses — one token mechanism, cleared by
        // the same cleanup. A session that issued none writes nothing.
        if (session.playback_token) setPlaybackToken(id, session.playback_token);
        settle({ status: "ready", session });
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        if (controller.signal.aborted) return;
        // Including 401 password_required: the unlock prompt is driven by the
        // detail fetch, and the player degrades to the detail's own URL.
        logger.debug("playback session unavailable", {
          kind,
          error: err instanceof Error ? err.message : String(err),
        });
        settle(UNAVAILABLE);
      });

    return () => {
      settled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, id, token]);

  return state;
}

/**
 * playbackMasterUrl answers "which HLS master does this player load?".
 *
 * A READY session answers it — that is what makes it the front door, and why the
 * detail's `hls_url` is no longer consulted when a session spoke. A session that
 * is ready and carries no manifest means there is no transcoded tree yet, which
 * is a real answer ("play the progressive original"), not a missing one. Only
 * when no session arrived at all does the detail stand in, which is precisely the
 * pre-session behaviour.
 */
export function playbackMasterUrl(
  state: PlaybackSessionState,
  detailUrl?: string | null,
): string | undefined {
  if (state.status === "ready") return state.session?.hls_url || undefined;
  return detailUrl || undefined;
}
