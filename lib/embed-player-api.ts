import { PLAYBACK_RATES } from "@/lib/player-rates";

// PeerTube's embed player API, server side of the channel. PeerTube's
// @peertube/embed-api speaks `jschannel`: JSON-STRING postMessages
//   request       {id, method: "<scope>::<name>", params}
//   response      {id, result} | {id, error, message}
//   notification  {method: "<scope>::<name>", params}      (no id)
// where scope defaults to "peertube" (?scope= overrides). We implement exactly
// that wire format so existing integrations work unchanged.
//
// Trust model: only messages whose source is the PARENT window and whose method
// is in the fixed table below are acted on; params are type-checked; nothing is
// evaluated or navigated. Outbound data is playback status and public caption
// metadata only, so when the parent's origin is unknown we post to "*" exactly as
// PeerTube does. Embed privacy is decided before this ever starts.

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Handler = (params: unknown) => Json | void;
const INVALID = Symbol("invalid");

export interface EmbedApi {
  notifyReady(): void;
  emitStatus(): void;
  stop(): void;
}

export function startEmbedApi(opts: {
  video: HTMLVideoElement;
  parent: Window;
  scope: string;
  /** The parent's origin when known (ancestorOrigins / referrer), else "*". */
  targetOrigin: string;
  statusIntervalMs?: number;
}): EmbedApi {
  const { video, parent, scope, targetOrigin } = opts;
  const prefix = `${scope}::`;
  let ready = false;
  let state: "unstarted" | "playing" | "paused" | "ended" = "unstarted";

  const post = (msg: Record<string, Json>) => parent.postMessage(JSON.stringify(msg), targetOrigin);
  const notify = (method: string, params: Json) => post({ method: prefix + method, params });

  const num = (v: unknown, min: number, max: number): number => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw INVALID;
    return v;
  };
  const captions = () =>
    Array.from(video.textTracks)
      .filter((t) => t.kind === "subtitles" || t.kind === "captions")
      .map((t) => ({ id: t.id || t.language, label: t.label, src: "", mode: t.mode }));

  const handlers: Record<string, Handler> = {
    play: () => {
      if (video.dispatchEvent(new Event("vidra:play-request", { cancelable: true }))) void video.play().catch(() => {});
    },
    pause: () => { video.dispatchEvent(new Event("vidra:pause-request")); video.pause(); },
    isPlaying: () => !video.paused,
    seek: (p) => { video.currentTime = num(p, 0, Number.MAX_SAFE_INTEGER); },
    getCurrentTime: () => video.currentTime,
    setVolume: (p) => { video.volume = num(p, 0, 1); },
    getVolume: () => video.volume,
    setPlaybackRate: (p) => { video.playbackRate = num(p, 0.0625, 16); },
    getPlaybackRate: () => video.playbackRate,
    getPlaybackRates: () => [...PLAYBACK_RATES],
    isReady: () => ready,
    getCaptions: captions,
    setCaption: (p) => {
      if (typeof p !== "string") throw INVALID;
      for (const t of Array.from(video.textTracks)) t.mode = (t.id || t.language) === p ? "showing" : "disabled";
    },
    // The HLS quality ladder is private to the player shell; not exposed yet.
    getResolutions: () => [],
    setResolution: () => {},
  };

  const onMessage = (e: MessageEvent) => {
    if (e.source !== parent || typeof e.data !== "string") return;
    let m: unknown;
    try { m = JSON.parse(e.data); } catch { return; }
    if (typeof m !== "object" || m === null) return;
    const { id, method, params } = m as { id?: unknown; method?: unknown; params?: unknown };
    if (typeof method !== "string" || !method.startsWith(prefix)) return;
    const name = method.slice(prefix.length);
    if (typeof id !== "number" && typeof id !== "string") return; // not a request
    if (!Object.hasOwn(handlers, name)) {
      post({ id, error: "method_not_found", message: method.slice(0, 100) });
      return;
    }
    try {
      post({ id, result: handlers[name](params) ?? null });
    } catch (err) {
      post({ id, error: "runtime_error", message: err === INVALID ? "invalid params" : "failed" });
    }
  };

  const emitStatus = () =>
    notify("playbackStatusUpdate", {
      position: video.currentTime,
      volume: video.volume,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      playbackState: state,
    });
  const change = (s: "playing" | "paused" | "ended") => () => {
    state = s;
    notify("playbackStatusChange", s);
  };
  const onPlay = change("playing"), onPause = change("paused"), onEnded = change("ended");
  const onVolume = () => notify("volumeChange", video.volume);

  window.addEventListener("message", onMessage);
  video.addEventListener("play", onPlay);
  video.addEventListener("pause", onPause);
  video.addEventListener("ended", onEnded);
  video.addEventListener("volumechange", onVolume);
  const interval = (opts.statusIntervalMs ?? 500) > 0 ? window.setInterval(emitStatus, opts.statusIntervalMs ?? 500) : 0;

  return {
    notifyReady() {
      ready = true;
      notify("ready", true);
    },
    emitStatus,
    stop() {
      window.removeEventListener("message", onMessage);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("volumechange", onVolume);
      if (interval) window.clearInterval(interval);
    },
  };
}
