"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type Hls from "hls.js";

import { videoHlsMasterUrl, videoOriginalUrl } from "@/lib/api";
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
  canPlayNativeHls,
  choosePlaybackMode,
  levelIndexForHeightCap,
  qualityIdOfLevel,
  resolveLevelIndex,
  type LevelOption,
  type PlaybackMode,
} from "@/lib/hls";
import {
  AUTO_QUALITY,
  isAutoQuality,
  sameQuality,
  type QualityId,
  type QualitySelection,
} from "@/lib/quality-id";

// How many hls.js-recommended recoveries (network → startLoad, media →
// recoverMediaError) to attempt after the manifest parsed before giving up and
// dropping to the progressive original file.
const MAX_RECOVERIES = 2;

export interface HlsPlayback {
  mode: PlaybackMode;
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
}

// probeSupport sniffs the browser's HLS capabilities once per call site. A
// scratch element answers canPlayType (it is per-type, not per-instance).
function probeSupport(): { mseSupported: boolean; nativeHls: boolean } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { mseSupported: false, nativeHls: false };
  }
  return {
    mseSupported: "MediaSource" in window || "ManagedMediaSource" in window,
    nativeHls: canPlayNativeHls(document.createElement("video")),
  };
}

/**
 * useHlsPlayback wires a media element to the right stream for a video:
 * hls.js (dynamically imported, so non-HLS videos never load it) when the
 * detail carries hls_url and MSE exists, native HLS without MSE (iOS Safari),
 * else the progressive /original file. In hls.js mode it exposes the parsed
 * quality menu and a setter for it; a fatal hls.js failure falls back to the
 * original file after bounded recovery attempts, so playback degrades instead
 * of dying.
 *
 * This is the hls.js ENGINE ADAPTER for quality. Everything it hands out — the
 * menu entries, the current selection, the pending target — is an engine-neutral
 * QualityId (lib/quality-id.ts) or the AUTO_QUALITY sentinel. hls.js's level
 * INDEX exists only inside this file and lib/hls.ts: minted from a selection at
 * the moment of assignment, and read out of an event immediately into an id.
 * Nothing downstream can hold one, which is what lets the same surfaces work
 * against another engine later.
 *
 * Quality switching uses `hls.nextLevel` (a SMOOTH switch that takes effect at
 * the next fragment boundary) rather than `hls.currentLevel` (which flushes the
 * buffer and re-seeks). A manual pick is held `pending` until the matching
 * `LEVEL_SWITCHED` fires — the shell paints a busy "…" on the label meanwhile —
 * and the active rung's height (reported by every LEVEL_SWITCHED, including ABR
 * switches on Auto) drives the "Auto (720p)" readout. This is a deliberate
 * behaviour change from the previous hard `currentLevel` switch.
 */
export function useHlsPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  video: { id: string; hls_url?: string },
  startAt: number | null,
  // Optional HLS master URL to stream from INSTEAD of the server one — used to
  // play a video from its IPFS gateway mirror (DR5). It only overrides the HLS
  // source; the progressive fallback stays the authoritative server /original,
  // so a mid-stream IPFS failure degrades to server playback, not a dead player.
  hlsMasterOverride?: string | null,
  // Optional video-scoped playback token for a password-protected video (CORE-17).
  // In hls.js/MSE mode it rides as `Authorization: Bearer <pt>` on every request
  // (xhrSetup, so master + variants + segments are all credentialed); in
  // native-HLS/progressive mode it is appended to the media src as `?pt=` (Safari
  // cannot set a request header on the media element). A secret — never logged.
  playbackToken?: string | null,
): HlsPlayback {
  const hasHls = Boolean(video.hls_url);
  // The id of a video whose hls.js pipeline fatally failed → play its original
  // instead. Keyed by id so a navigation to another video decides afresh.
  const [failedId, setFailedId] = useState<string | null>(null);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [currentQuality, setCurrentQuality] = useState<QualitySelection>(AUTO_QUALITY);
  // The rendition a manual switch is heading to, until LEVEL_SWITCHED confirms
  // it; null when nothing is in flight (Auto/ABR or already settled).
  const [pendingQuality, setPendingQuality] = useState<QualityId | null>(null);
  // Pixel height of the rung hls.js is actually playing (last LEVEL_SWITCHED).
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const decided = useMemo(
    () => choosePlaybackMode({ hasHls, ...probeSupport() }),
    [hasHls],
  );
  const mode: PlaybackMode = failedId === video.id ? "original" : decided;

  useEffect(() => {
    if (mode !== "hls-js") return;
    const el = videoRef.current;
    if (!el) return;
    let disposed = false;
    setLevels([]);
    setCurrentQuality(AUTO_QUALITY);
    setPendingQuality(null);
    setActiveHeight(null);
    // Dynamic import: the hls.js chunk loads only when an HLS video actually
    // plays through MSE — never for original/native playback.
    void import("hls.js")
      .then(({ default: HlsClass }) => {
        if (disposed) return;
        if (!HlsClass.isSupported()) {
          setFailedId(video.id);
          return;
        }
        const hls = new HlsClass({
          startPosition: startAt ?? -1,
          // A recent authoritative-server measurement prevents an unnecessarily
          // low cold start. IPFS mirrors have different path characteristics,
          // so they use the balanced seed without reading the stored estimate.
          abrEwmaDefaultEstimate: hlsMasterOverride
            ? HLS_ABR_DEFAULT_ESTIMATE
            : readStoredBandwidthEstimate(),
          // Keep long watches and autoplay sessions from retaining every played
          // fragment in MSE. Ninety seconds still leaves a useful instant
          // scrub-back window without letting memory grow for the full session.
          backBufferLength: 90,
          // Do not download/decode a rendition the rendered player cannot use,
          // and step down when decoding cannot keep up with the selected rung.
          capLevelToPlayerSize: true,
          capLevelOnFPSDrop: true,
          // Credential a password-protected video's HLS requests with the Bearer
          // playback token. Skipped when playing the IPFS gateway mirror (a public
          // gateway needs no token and a non-simple Authorization header would trip
          // its CORS preflight) — password videos are never IPFS-mirrored anyway.
          ...(playbackToken && !hlsMasterOverride
            ? {
                xhrSetup: (xhr: XMLHttpRequest) => {
                  xhr.setRequestHeader("Authorization", `Bearer ${playbackToken}`);
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
        // single-codec masters never change it, so their menu is built once,
        // exactly as before.
        let menuCodecSet: string | undefined;
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
          // about what "720p" means.
          const heightCap = autoHeightCapForNetwork(browserNetworkInformation());
          const capIndex =
            heightCap === null ? null : levelIndexForHeightCap(hls.levels, heightCap);
          if (capIndex !== null) hls.autoLevelCapping = capIndex;
        });
        if (!hlsMasterOverride) {
          hls.on(HlsClass.Events.FRAG_BUFFERED, () => {
            storeBandwidthEstimate(hls.bandwidthEstimate);
          });
        }
        // Every effective rung switch (ABR on Auto, or a confirmed manual pick):
        // record the active height for the "Auto (720p)" readout, and clear the
        // pending flag once the switch reaches the requested rung.
        hls.on(HlsClass.Events.LEVEL_SWITCHED, (_event, data) => {
          const level = hls.levels[data.level];
          const switched = qualityIdOfLevel(level);
          setActiveHeight(switched?.height ?? null);
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
          // Fatal before the manifest parsed (e.g. the playlist 404s despite
          // the detail advertising it) — or recovery exhausted: drop to the
          // original file rather than a dead player.
          if (!parsed || recoveries >= MAX_RECOVERIES) {
            hls.destroy();
            hlsRef.current = null;
            setFailedId(video.id);
            return;
          }
          recoveries += 1;
          if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            hls.destroy();
            hlsRef.current = null;
            setFailedId(video.id);
          }
        });
        hls.loadSource(
          hlsMasterOverride || videoHlsMasterUrl(video.id, null, video.hls_url),
        );
        hls.attachMedia(el);
      })
      .catch(() => {
        if (!disposed) setFailedId(video.id);
      });
    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [mode, video.id, video.hls_url, videoRef, startAt, hlsMasterOverride, playbackToken]);

  const fragment = startAt !== null ? `#t=${startAt}` : "";
  // The `?pt=` token rides only on the SERVER media URLs (native-HLS master +
  // progressive original); the IPFS gateway override needs no token. The token
  // (a query param) is placed before the `#t=` media fragment.
  const src =
    mode === "hls-js"
      ? undefined
      : mode === "native-hls"
        ? (hlsMasterOverride ||
            videoHlsMasterUrl(video.id, playbackToken, video.hls_url)) + fragment
        : videoOriginalUrl(video.id, playbackToken) + fragment;

  return {
    mode,
    src,
    // Native HLS (iOS Safari, no MSE) deliberately exposes NO quality entries.
    // There the browser owns variant selection outright, steered by the SCORE
    // attribute the backend emits on each variant; nothing can read which
    // variant is playing or ask for another, so a QualityId has no faithful
    // implementation on that path. An empty list is the honest answer and hides
    // the menu (QualityMenu renders null) — do not synthesize a list here from
    // the manifest, it would render a control that cannot control anything.
    levels: mode === "hls-js" ? levels : [],
    currentQuality,
    activeHeight: mode === "hls-js" ? activeHeight : null,
    pending: pendingQuality !== null,
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
