"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type Hls from "hls.js";

import { liveHlsMasterUrl, videoHlsMasterUrl, videoOriginalUrl } from "@/lib/api";
import type { PlaybackSession } from "@/lib/api/types";
import {
  HLS_ABR_DEFAULT_ESTIMATE,
  autoHeightCapForNetwork,
  browserNetworkInformation,
  readStoredBandwidthEstimate,
  storeBandwidthEstimate,
} from "@/lib/hls-bandwidth";
import {
  HLS_AUTO_LEVEL,
  buildLevelMenu,
  levelIndexForHeightCap,
  qualityIdOfLevel,
  resolveLevelIndex,
  type LevelOption,
} from "@/lib/hls";
import {
  HLS_ENGINES,
  pickEngine,
  probeSupport,
  selectEngines,
  type EngineId,
  type EngineSources,
} from "@/lib/player-engine";
import { finalFetchUrl, hlsErrorClass } from "@/lib/playback-qoe";
import { playbackMasterUrl, usePlaybackSession } from "@/lib/playback-session";
import { remotePlaybackSources } from "@/lib/remote-playback";
import { usePlaybackQoE } from "@/lib/use-playback-qoe";
import {
  AUTO_QUALITY,
  isAutoQuality,
  sameQuality,
  type QualityId,
  type QualitySelection,
} from "@/lib/quality-id";

// THE ENGINE ADAPTER. One lifecycle, three surfaces.
//
// VOD, live and federated playback used to run three near-identical hls.js
// lifecycles: the same byte-for-byte capability probe, the same dynamic-import
// preamble, the same teardown closure, and an ERROR handler that differed only
// in which terminal setter it called. Three copies meant three places to fix
// anything, and in practice only one of them ever got fixed: federated playback
// was constructed with NO config at all — no `capLevelToPlayerSize`, no
// `backBufferLength` — so an open federated watch retained the entire played
// stream in MSE, and it destroyed the engine on the first fatal error while the
// other two retried network and media errors twice.
//
// What is genuinely per-surface is CONFIGURATION, and it is all visible in the
// three small hooks at the bottom of this file: VOD's start position, playback
// token and remembered throughput; live's plain-HLS mode and short rewind
// window; the federated source ladder. Everything else — probing, selection,
// construction, the quality menu, the recovery ladder, teardown — happens once,
// here.
//
// QUALITY IDENTITY. Everything this module hands out is an engine-neutral
// QualityId (lib/quality-id.ts) or the AUTO_QUALITY sentinel. hls.js's level
// INDEX exists only inside this file and lib/hls.ts: minted from a selection at
// the moment of assignment, and read out of an event straight into an id.
// Nothing downstream can hold one, which is what lets these same surfaces work
// against another engine later.
//
// DYNAMIC IMPORT IS A HARD RULE. `import("hls.js")` is only ever reached once
// the hls.js engine has actually won selection, so a viewer who plays natively,
// progressively — or who never plays anything — never downloads the chunk. Any
// second engine added here must obey the same rule.
//
// THE SESSION IS THE FRONT DOOR (phase-4 item 1). Each surface opens a playback
// session before it plays and drives the master URL from the session's answer;
// the video detail's `hls_url` is now only the fallback for a session that never
// arrived. The session is also where a playback token comes from — CONDITIONALLY:
// the server mints one only for a subject that cannot be played without it, and
// this file attaches a credential ONLY when it was handed one. Anything else
// would mark every media request credentialed, which forces `no-store` and blocks
// every CDN/presign redirect for viewers who needed none of it.
//
// AND IT IS THE ONE CAPTURE POINT for playback quality (item 4). Because all
// three surfaces run this lifecycle, instrumenting it here instruments every one
// of them — see lib/use-playback-qoe.ts. Telemetry is fire-and-forget and never
// on a playback path.

// How many hls.js-recommended recoveries (network → startLoad, media →
// recoverMediaError) to attempt after the manifest parsed before giving up on
// the playlist entirely. What "giving up" lands on is the surface's business:
// VOD still has a progressive original, live and federated streams do not.
const MAX_RECOVERIES = 2;

const NO_ENGINES: readonly EngineId[] = [];

/**
 * The narrow contract every playback surface codes against — the bespoke shell
 * (components/player/VideoPlayer.tsx) imports no hls.js type or value, only
 * this. An engine swap is a change to this file and nothing above it.
 */
export interface HlsPlayback {
  /** The engine actually playing, or null when nothing here can play this. */
  mode: EngineId | null;
  /** src for the media element; undefined while hls.js owns it via MSE. */
  src: string | undefined;
  /** Quality menu entries (Auto + one per height); [] when nothing is selectable. */
  levels: LevelOption[];
  /** The user's selection (AUTO_QUALITY = adaptive). Drives the menu's checked entry. */
  currentQuality: QualitySelection;
  /** Pixel height of the rung actually playing (from LEVEL_SWITCHED); null until known. */
  activeHeight: number | null;
  /** True while a manual rung switch has been requested but not yet confirmed. */
  pending: boolean;
  setQuality: (quality: QualitySelection) => void;
  /**
   * The CMAF tree's DASH manifest, when the session advertised one.
   * INFORMATIONAL: nothing plays it and it must not influence engine selection —
   * there is no DASH engine yet (item 3c). It is surfaced so the second engine,
   * when it lands, finds the manifest already in hand.
   */
  dashUrl: string | null;
}

/** Live playback, plus the one thing only a live surface needs. */
export interface LivePlayback extends HlsPlayback {
  /**
   * True once the live playlist could not be played (no engine can play it, or
   * hls.js failed fatally after bounded recovery). A live stream has no original
   * file to fall back to, so the surface shows an honest error instead.
   */
  failed: boolean;
}

/**
 * Federated playback. Narrower on purpose: the remote watch surface renders a
 * raw `<video controls>` with no quality menu, so exposing menu entries it
 * cannot render would be a control that controls nothing.
 */
export type RemotePlayback = Pick<HlsPlayback, "mode" | "src">;

/** The per-surface hls.js tuning. Everything absent here is shared, by design. */
interface EngineTuning {
  /** Seek position to open at; null/undefined leaves hls.js at its own default. */
  startPosition?: number | null;
  /** Seconds of played media hls.js may retain in MSE. */
  backBufferLength: number;
  /** Set false to keep hls.js off the LL-HLS path; omit for its own default. */
  lowLatencyMode?: boolean;
  /** Bearer token for every hls.js request (a password-protected video). Secret. */
  authToken?: string | null;
  /**
   * How this path's ABR cold start is seeded and measured:
   * - "measured" — reuse the throughput remembered from the last watch on this
   *   path and remember this one. Only the authoritative server path qualifies.
   * - "seeded"   — open on the balanced default and remember nothing. A path
   *   with different characteristics (an IPFS gateway mirror) must neither read
   *   from nor write to the server measurement.
   * - "engine"   — leave hls.js's own conservative default alone. The honest
   *   answer for a path nothing has ever measured (live, a foreign origin).
   */
  bandwidth: "measured" | "seeded" | "engine";
  /**
   * Hold everything: pick no engine, load nothing, report `mode` null. Set while
   * the playback session is still in flight, because starting on the detail's URL
   * and swapping to the session's a moment later would restart a loading media
   * element for no reason. It is NOT a failure — a live surface must not read it
   * as one.
   */
  suspended?: boolean;
  /**
   * The session this playback belongs to, when there is one. Used for exactly
   * two things here: quality telemetry keys on it (null ⇒ this playback is not
   * measured), and its `dash_url` is passed through unplayed.
   */
  session?: PlaybackSession | null;
}

/**
 * usePlaybackEngine is the whole lifecycle: probe the browser, ask each engine
 * whether it can play these sources, drive the winner, and walk the list forward
 * when one drops out. `key` is the identity of the thing being played (a video
 * or stream id) — a change to it decides afresh, so a video that failed here
 * never poisons the next one.
 */
function usePlaybackEngine(
  videoRef: RefObject<HTMLVideoElement | null>,
  key: string,
  sources: EngineSources,
  tuning: EngineTuning,
): HlsPlayback {
  const { hlsJs, nativeHls, progressive } = sources;
  const {
    startPosition,
    backBufferLength,
    lowLatencyMode,
    authToken,
    bandwidth,
    suspended = false,
    session = null,
  } = tuning;

  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [currentQuality, setCurrentQuality] = useState<QualitySelection>(AUTO_QUALITY);
  // The rendition a manual switch is heading to, until LEVEL_SWITCHED confirms
  // it; null when nothing is in flight (Auto/ABR or already settled).
  const [pendingQuality, setPendingQuality] = useState<QualityId | null>(null);
  // Pixel height of the rung the engine is actually playing (last LEVEL_SWITCHED).
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Engines that dropped out for THIS key. Keyed so navigating to another video
  // (or stream) starts from the full candidate list again.
  const [declined, setDeclined] = useState<{ key: string; engines: EngineId[] }>({
    key,
    engines: [],
  });
  const declineEngines = useCallback((forKey: string, ...ids: readonly EngineId[]) => {
    setDeclined((prev) => {
      const base = prev.key === forKey ? prev.engines : [];
      const added = ids.filter((id) => !base.includes(id));
      if (added.length === 0) return prev;
      return { key: forKey, engines: [...base, ...added] };
    });
  }, []);

  const candidates = useMemo(
    // Suspended: no candidates, so no engine is picked and nothing loads. The
    // list is rebuilt (and playback begins) the moment the session settles.
    () => (suspended ? NO_ENGINES : selectEngines({ hlsJs, nativeHls, progressive }, probeSupport())),
    [suspended, hlsJs, nativeHls, progressive],
  );
  const declinedHere = declined.key === key ? declined.engines : NO_ENGINES;
  const mode = useMemo(
    () => pickEngine(candidates, declinedHere),
    [candidates, declinedHere],
  );

  // The URL the winning engine was pointed at — the pre-redirect fallback for
  // "where did these bytes come from?". hls.js improves on it per fragment with
  // the post-redirect URL; a media element cannot, so for native/progressive this
  // is the answer.
  const activeSourceUrl =
    mode === "hls-js" ? hlsJs : mode === "native-hls" ? nativeHls : mode === "progressive" ? progressive : undefined;
  const telemetry = usePlaybackQoE({ videoRef, engine: mode, session, sourceUrl: activeSourceUrl });

  useEffect(() => {
    if (mode !== "hls-js" || !hlsJs) return; // the other engines play via <video src>.
    const el = videoRef.current;
    if (!el) return;
    let disposed = false;
    setLevels([]);
    setCurrentQuality(AUTO_QUALITY);
    setPendingQuality(null);
    setActiveHeight(null);
    // Dynamic import: the hls.js chunk loads only once this engine has won
    // selection — never for native, progressive, or unplayable sources.
    void import("hls.js")
      .then(({ default: HlsClass }) => {
        if (disposed) return;
        if (!HlsClass.isSupported()) {
          // Capability negotiation, second half. hls.js itself is the authority
          // on whether it can run here, and only it can answer. A "no" declines
          // THIS engine and nothing else, so the next candidate takes over —
          // which on an MSE-partial Apple browser is native HLS, the whole
          // reason this is a decline and not a failure.
          declineEngines(key, "hls-js");
          return;
        }
        const hls = new HlsClass({
          ...(typeof startPosition === "number" ? { startPosition } : {}),
          // Keep long watches and autoplay sessions from retaining every played
          // fragment in MSE. Every surface gets this; a federated watch used to
          // get none of it.
          backBufferLength,
          // Do not download/decode a rendition the rendered player cannot use,
          // and step down when decoding cannot keep up with the selected rung.
          capLevelToPlayerSize: true,
          capLevelOnFPSDrop: true,
          ...(lowLatencyMode === undefined ? {} : { lowLatencyMode }),
          ...(bandwidth === "measured"
            ? { abrEwmaDefaultEstimate: readStoredBandwidthEstimate() }
            : bandwidth === "seeded"
              ? { abrEwmaDefaultEstimate: HLS_ABR_DEFAULT_ESTIMATE }
              : {}),
          // Credential a password-protected video's HLS requests with the Bearer
          // playback token, so master + variants + segments are all credentialed.
          ...(authToken
            ? {
                xhrSetup: (xhr: XMLHttpRequest) => {
                  xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
                },
              }
            : {}),
        });
        hlsRef.current = hls;
        let parsed = false;
        let recoveries = 0;
        // The codec family the quality menu is currently built from. With a
        // multi-codec master (same ladder in H.264 + HEVC + AV1) the menu must
        // list only the family hls.js is actually playing, or a manual pick can
        // force a cross-codec switch ABR would never make (see buildLevelMenu);
        // single-codec masters never change it, so their menu is built once.
        let menuCodecSet: string | undefined;
        // The playlist itself is unplayable: drop EVERY HLS engine at once. The
        // evidence is about the stream, not about one engine — and retrying a
        // broken master through native HLS would be worse than useless on the
        // Chromium builds whose canPlayType claims HLS they cannot play.
        const giveUpOnHls = () => {
          hls.destroy();
          hlsRef.current = null;
          declineEngines(key, ...HLS_ENGINES);
        };
        hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
          parsed = true;
          // The rung hls.js is about to start on names the codec family it has
          // chosen: firstAutoLevel is ABR's own opening pick (we set no
          // startLevel, so that IS the start level). It can be -1 before ABR has
          // decided, which leaves menuCodecSet undefined — buildLevelMenu's
          // unknown-family path — and LEVEL_SWITCHED below corrects the menu if
          // the engine settles in another family.
          menuCodecSet = hls.levels[hls.firstAutoLevel]?.codecSet;
          setLevels(buildLevelMenu(hls.levels, menuCodecSet));
          // The metered-network policy speaks HEIGHTS; the engine caps by level
          // index, so translate here — the menu and the cap must not disagree
          // about what "720p" means. This is a policy about the VIEWER's
          // connection, not about the path, so every surface gets it.
          const heightCap = autoHeightCapForNetwork(browserNetworkInformation());
          const capIndex =
            heightCap === null ? null : levelIndexForHeightCap(hls.levels, heightCap);
          if (capIndex !== null) hls.autoLevelCapping = capIndex;
        });
        if (bandwidth === "measured") {
          hls.on(HlsClass.Events.FRAG_BUFFERED, () => {
            storeBandwidthEstimate(hls.bandwidthEstimate);
          });
        }
        // Where the bytes actually came from. FRAG_LOADED (not FRAG_BUFFERED) is
        // the event that carries the loader, and the loader is the only place the
        // FINAL url — after a 307 to a CDN or a presigned object store — is
        // visible at all. The client reports that origin and the SERVER decides
        // what it means; this file never names a delivery source.
        hls.on(HlsClass.Events.FRAG_LOADED, (_event, data) => {
          telemetry.observeFetch(finalFetchUrl(data?.networkDetails) ?? data?.frag?.url);
        });
        // Every effective rung switch (ABR on Auto, or a confirmed manual pick):
        // record the active height for the "Auto (720p)" readout, and clear the
        // pending flag once the switch reaches the requested rung.
        hls.on(HlsClass.Events.LEVEL_SWITCHED, (_event, data) => {
          const level = hls.levels[data.level];
          const switched = qualityIdOfLevel(level);
          setActiveHeight(switched?.height ?? null);
          // The rung in play, for telemetry. The FIRST one is the opening pick
          // and is reported on playback.start, not as a switch — the reporter
          // owns that distinction.
          telemetry.reportRendition(switched?.height ?? null);
          // Follow the engine's codec choice: only when the effective rung has
          // left the family the menu was built from (possible on a multi-codec
          // master) is the menu rebuilt, inside the new family.
          if (level && level.codecSet !== menuCodecSet) {
            menuCodecSet = level.codecSet;
            setLevels(buildLevelMenu(hls.levels, menuCodecSet));
          }
          // A pending pick is confirmed by the engine landing on that RENDITION,
          // not on some particular index: two levels can be the same rung.
          setPendingQuality((p) => (p === null || sameQuality(switched, p) ? null : p));
        });
        hls.on(HlsClass.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          // Every fatal error is a quality event, including the ones the ladder
          // below recovers from: playback stopped, whether or not it resumed.
          // Non-fatal errors are not reported — hls.js emits them constantly and
          // they say nothing about what the viewer saw.
          telemetry.reportError(hlsErrorClass(data.type, data.details));
          // Fatal before the manifest parsed (e.g. the playlist 404s despite the
          // detail advertising it) — or recovery exhausted.
          if (!parsed || recoveries >= MAX_RECOVERIES) {
            giveUpOnHls();
            return;
          }
          recoveries += 1;
          if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            giveUpOnHls();
          }
        });
        hls.loadSource(hlsJs);
        hls.attachMedia(el);
      })
      .catch(() => {
        // The chunk itself would not load. That says nothing about whether this
        // browser plays HLS natively, and we only get here on a browser that
        // reported MSE — so treat it as the playlist being out of reach rather
        // than promoting a native path we have no evidence for.
        if (!disposed) declineEngines(key, ...HLS_ENGINES);
      });
    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [
    mode,
    key,
    hlsJs,
    videoRef,
    startPosition,
    backBufferLength,
    lowLatencyMode,
    authToken,
    bandwidth,
    declineEngines,
    telemetry,
  ]);

  const src =
    mode === "native-hls" ? nativeHls : mode === "progressive" ? progressive : undefined;

  return {
    mode,
    src,
    // Only hls.js exposes controllable quality. Native HLS deliberately exposes
    // NO entries: there the browser owns variant selection outright, steered by
    // the SCORE attribute the backend emits on each variant, and nothing can
    // read which variant is playing or ask for another — so a QualityId has no
    // faithful implementation on that path. An empty list is the honest answer
    // and hides the menu (QualityMenu renders null); do NOT synthesize a list
    // from the manifest, it would render a control that cannot control anything.
    levels: mode === "hls-js" ? levels : [],
    currentQuality,
    activeHeight: mode === "hls-js" ? activeHeight : null,
    pending: pendingQuality !== null,
    // Advertised, never played — see HlsPlayback.dashUrl.
    dashUrl: session?.dash_url ?? null,
    setQuality: (quality: QualitySelection) => {
      const hls = hlsRef.current;
      if (!hls) return;
      // The one place a level index exists: minted from the selection, written
      // straight to the engine, never stored. A rung this level list no longer
      // offers resolves to null and is ignored rather than guessed at.
      const index = isAutoQuality(quality)
        ? HLS_AUTO_LEVEL
        : resolveLevelIndex(hls.levels, quality);
      if (index === null) return;
      // Smooth switch at the next fragment boundary (nextLevel), not a buffer
      // flush (currentLevel). Hold the pick pending until LEVEL_SWITCHED lands.
      hls.nextLevel = index;
      setCurrentQuality(quality);
      setPendingQuality(isAutoQuality(quality) ? null : quality);
    },
  };
}

/**
 * useHlsPlayback plays a local VOD video: the HLS ladder the SESSION advertises,
 * the progressive /original file otherwise and as the last resort when the ladder
 * proves unplayable.
 *
 * The session is opened first and answers the manifest question (item 1). The
 * detail's `hls_url` is now only the fallback for a session that never arrived,
 * which is exactly how this played before sessions existed.
 */
export function useHlsPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  video: { id: string; hls_url?: string },
  startAt: number | null,
  // Optional HLS master URL to stream from INSTEAD of the server one — used to
  // play a video from its IPFS gateway mirror (DR5). It only overrides the HLS
  // sources; the progressive fallback stays the authoritative server /original,
  // so a mid-stream IPFS failure degrades to server playback, not a dead player.
  hlsMasterOverride?: string | null,
  // Optional video-scoped playback token for a password-protected video (CORE-17).
  // Through hls.js it rides as `Authorization: Bearer <pt>` on every request; a
  // media element cannot set a request header, so on the native-HLS and
  // progressive paths it is appended to the src as `?pt=`. A secret — never logged.
  playbackToken?: string | null,
): HlsPlayback {
  // The session is authorized exactly like the media routes, so the unlock
  // token — when the viewer has one — is what opens a password video's session.
  const sessionState = usePlaybackSession("video", video.id, playbackToken);
  const master = playbackMasterUrl(sessionState, video.hls_url);
  // A session-scoped token, and ONLY where the server issued one. A public video
  // gets none, which is what keeps its bytes CDN-eligible; the session's token
  // supersedes the unlock token because the session id is signed into it, which
  // is what lets the beacon be attested.
  const token = sessionState.session?.playback_token ?? playbackToken;
  const hasHls = Boolean(master);
  // The `?pt=` token (a query param) is placed before the `#t=` media fragment.
  const fragment = startAt !== null ? `#t=${startAt}` : "";
  return usePlaybackEngine(
    videoRef,
    video.id,
    {
      hlsJs: hasHls ? hlsMasterOverride || videoHlsMasterUrl(video.id, null, master) : undefined,
      nativeHls: hasHls
        ? (hlsMasterOverride || videoHlsMasterUrl(video.id, token, master)) + fragment
        : undefined,
      progressive: videoOriginalUrl(video.id, token) + fragment,
    },
    {
      startPosition: startAt,
      backBufferLength: 90,
      // No token on the IPFS gateway mirror: a public gateway needs none, and a
      // non-simple Authorization header would trip its CORS preflight. Password
      // videos are never IPFS-mirrored anyway.
      authToken: hlsMasterOverride ? null : token,
      bandwidth: hlsMasterOverride ? "seeded" : "measured",
      // Wait for the session rather than start on the detail's URL and swap.
      suspended: sessionState.status === "pending",
      session: sessionState.session,
    },
  );
}

/**
 * useLivePlayback plays a live stream's HLS playlist. Unlike VOD there is no
 * progressive fallback — nothing to degrade to — so an unplayable feed surfaces
 * as `failed` and the watch surface says so instead of spinning a dead player.
 */
export function useLivePlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  streamId: string,
): LivePlayback {
  // Live's session half (item 7). A PRIVATE stream's session carries the only
  // revocable, expiring credential live has; a public one carries none and none
  // is sent. The API rewrites the rolling playlist's segment URIs to carry this
  // same `?pt=`, so it survives relative resolution on Safari's native HLS.
  const sessionState = usePlaybackSession("live", streamId);
  const token = sessionState.session?.playback_token ?? null;
  // The session advertises the playlist; the deterministic path stands in when
  // no session arrived, which is exactly what live played before.
  const master = liveHlsMasterUrl(streamId, token, sessionState.session?.hls_url);
  const playback = usePlaybackEngine(
    videoRef,
    streamId,
    { hlsJs: master, nativeHls: master },
    {
      suspended: sessionState.status === "pending",
      // Carries live_stream_id and no video_id, so nothing is measured yet — the
      // ingest endpoint has no live path (see qoeSubject). Passed anyway so the
      // day it does, this is already wired.
      session: sessionState.session,
      // hls.js cannot put the token in the URL for its own requests, so it rides
      // as a Bearer header there; the media element gets it as `?pt=` above.
      authToken: token,
      // Live playback needs a much shorter rewind window than VOD. Bounding it
      // prevents an open live tab from retaining the entire broadcast.
      backBufferLength: 30,
      // nginx-rtmp emits conventional HLS playlists (EXTINF segments), not
      // LL-HLS parts/server-control tags. Keep hls.js on its matching plain HLS
      // path until the media server actually publishes those LL tags.
      lowLatencyMode: false,
      // Nothing has ever measured the live edge; it is not the VOD path and must
      // not read or write the VOD measurement.
      bandwidth: "engine",
    },
  );
  // "No engine" is only a failure once something was actually attempted — while
  // the session is still in flight nothing has been tried yet, and reporting a
  // dead stream there would flash an error panel over every live open.
  return { ...playback, failed: sessionState.status !== "pending" && playback.mode === null };
}

/**
 * useRemotePlayback plays a federated video's origin stream_url: the HLS ladder
 * for an .m3u8, a plain media element for a direct file, and nothing at all when
 * the origin advertised nothing playable — the caller then keeps its "Watch on
 * <origin>" link as the honest path.
 */
export function useRemotePlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  video: { id: string; stream_url?: string },
): RemotePlayback {
  const { mode, src } = usePlaybackEngine(
    videoRef,
    video.id,
    remotePlaybackSources(video.stream_url),
    {
      backBufferLength: 90,
      // A foreign origin's path characteristics are its own; the server
      // measurement says nothing about it in either direction.
      bandwidth: "engine",
      // No session and no telemetry, deliberately: this instance neither brokers
      // nor delivers these bytes, so there is nothing here to broker and nothing
      // about ITS delivery to measure. There is no remote playback-session
      // endpoint to call.
      session: null,
    },
  );
  return { mode, src };
}
