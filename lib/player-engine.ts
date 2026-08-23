// Which ENGINE plays a given source. Pure: no React, no hls.js — the single
// lifecycle that drives whichever engine wins lives in lib/use-playback-engine.ts.
//
// THREE ENGINES, ALL REAL:
//   - "hls-js"      — a master playlist through hls.js over MSE. The only path
//                     that exposes a controllable quality handle, so it is asked
//                     first wherever it is possible at all.
//   - "native-hls"  — a master playlist straight into <video src>. This is NOT
//                     an edge case: on an MSE-less Apple browser it is the whole
//                     ABR ladder, and the only alternative is a multi-gigabyte
//                     progressive file. Demoting it to a last resort is a
//                     bandwidth cliff, not a fallback.
//   - "progressive" — a Range-capable file into <video src>.
//
// SELECTION IS `probe → ask each engine → pick`. The browser is probed once,
// every engine answers whether it can play THIS source HERE, and the first
// survivor of that ordered list wins. What it replaces: a single `mseSupported`
// boolean decided the mode outright, and only afterwards — inside the running
// lifecycle — was `Hls.isSupported()` consulted; when that said no, the player
// dropped to the progressive file even on a device that plays HLS natively.
// Capability negotiation belongs here, not downstream of a decision already made.
//
// hls.js's own `isSupported()` is the authority on whether it can run, and it
// lives inside the chunk we deliberately do not load unless we mean to use it.
// So the hls.js engine's answer here is PROVISIONAL — "MSE exists, ask me
// again after the import" — and the lifecycle confirms or DECLINES it once the
// module is in hand. A decline drops that engine from the ordered list and the
// next survivor takes over, which is exactly how an MSE-partial browser reaches
// native HLS instead of the progressive file.

/**
 * The engines a playback surface can be handed. Also the `mode` every surface
 * reports: one vocabulary, whether the surface calls its progressive file the
 * "original" (VOD) or a "direct" file (federated).
 */
export type EngineId = "hls-js" | "native-hls" | "progressive";

/**
 * The engines that read a master playlist. When the PLAYLIST itself proves
 * unplayable (a fatal error the recovery ladder could not absorb) every one of
 * them is out at once — the evidence is about the stream, not about one engine.
 */
export const HLS_ENGINES: readonly EngineId[] = ["hls-js", "native-hls"];

/**
 * The URL each engine would play, where one exists. They are separate fields
 * rather than one URL because the credentials differ per engine: hls.js carries
 * a playback token as an `Authorization` header (xhrSetup) while a media element
 * cannot set headers and needs it as `?pt=` in the URL, and a media-element src
 * also carries the `#t=` start fragment. An absent field means "this engine has
 * nothing to play here" and takes it out of the running.
 */
export interface EngineSources {
  hlsJs?: string;
  nativeHls?: string;
  progressive?: string;
}

/** What the browser says it can do. Probed once per lifecycle, not per engine. */
export interface SupportProbe {
  /** Media Source Extensions in any spelling hls.js can drive. */
  mseSupported: boolean;
  /** The media element claims the Apple HLS MIME type. */
  nativeHls: boolean;
}

/**
 * canPlayNativeHls reports whether a media element claims native HLS support
 * (canPlayType is "maybe"/"probably" for the Apple HLS MIME type). True on
 * Safari — and, notably, on Chromium builds that cannot actually play HLS
 * natively at all. That lie is why native HLS is only ever promoted above the
 * progressive file on positive evidence that hls.js declined (see the module
 * header), never on evidence that a stream failed.
 */
export function canPlayNativeHls(el: { canPlayType(type: string): string }): boolean {
  return el.canPlayType("application/vnd.apple.mpegurl") !== "";
}

/**
 * probeSupport sniffs the browser's HLS capabilities. A scratch element answers
 * canPlayType (it is per-type, not per-instance). Server-side there is no
 * browser to ask, and every answer is honestly "no" — the surfaces that use this
 * all mount client-side behind a fetch, so nothing renders off that answer.
 */
export function probeSupport(): SupportProbe {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { mseSupported: false, nativeHls: false };
  }
  return {
    mseSupported: "MediaSource" in window || "ManagedMediaSource" in window,
    nativeHls: canPlayNativeHls(document.createElement("video")),
  };
}

/**
 * The engines in preference order, each with its own answer to "can I play this
 * here?". hls.js first because it is the only engine with a quality handle;
 * native HLS ahead of progressive because a ladder beats a single flat file.
 */
const ENGINES: ReadonlyArray<{
  id: EngineId;
  canPlay: (sources: EngineSources, support: SupportProbe) => boolean;
}> = [
  { id: "hls-js", canPlay: (s, p) => Boolean(s.hlsJs) && p.mseSupported },
  { id: "native-hls", canPlay: (s, p) => Boolean(s.nativeHls) && p.nativeHls },
  { id: "progressive", canPlay: (s) => Boolean(s.progressive) },
];

/**
 * selectEngines asks every engine whether it can play these sources in this
 * browser and returns the ones that said yes, in preference order. An empty
 * result means nothing here is playable — the caller shows its honest
 * link-out/unavailable surface rather than a dead player.
 */
export function selectEngines(
  sources: EngineSources,
  support: SupportProbe,
): EngineId[] {
  return ENGINES.filter((engine) => engine.canPlay(sources, support)).map((e) => e.id);
}

/**
 * pickEngine takes the first candidate that has not been declined. Declining is
 * how the lifecycle walks the list forward: hls.js answering `isSupported()`
 * false removes just itself, while a playlist that fails outright removes every
 * HLS engine at once. Returns null when nothing is left.
 */
export function pickEngine(
  candidates: readonly EngineId[],
  declined: readonly EngineId[],
): EngineId | null {
  return candidates.find((id) => !declined.includes(id)) ?? null;
}
