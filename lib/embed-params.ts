import { parseStartTime } from "@/lib/start-time";

// PeerTube's embed URL options (client/src/standalone/videos/shared/
// player-options-builder.ts), parsed the way PeerTube parses them so a migrated
// instance's third-party iframes keep behaving. Toggles are true ONLY for "1" or
// "true" (any other present value is false); everything is validated, so a bad
// value falls back to the default instead of reaching the player.
export interface EmbedParams {
  startAt: number | null;
  stopAt: number | null;
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
  title: boolean;
  controls: boolean;
  /** Parsed for compatibility; vidra's embed shows no sensitive-content warning title. */
  warningTitle: boolean;
  peertubeLink: boolean;
  api: boolean;
  scope: string;
}

/** Query keys the embed understands (the legacy redirect carries exactly these). */
export const EMBED_PARAM_KEYS = [
  "autoplay", "muted", "loop", "stop", "title", "controls", "warningTitle", "peertubeLink", "api", "scope",
] as const;

function toggle(p: URLSearchParams, name: string, dflt: boolean): boolean {
  const v = p.get(name);
  return v === null ? dflt : v === "1" || v === "true";
}

function seconds(p: URLSearchParams, name: string): number | null {
  const v = p.get(name);
  return v === null ? null : parseStartTime(`?t=${encodeURIComponent(v)}`);
}

export function parseEmbedParams(search: string): EmbedParams {
  const p = new URLSearchParams(search);
  const startAt = seconds(p, "t") ?? seconds(p, "start");
  const stop = seconds(p, "stop");
  const scope = p.get("scope") ?? "";
  return {
    startAt,
    stopAt: stop !== null && stop > (startAt ?? 0) ? stop : null,
    autoplay: toggle(p, "autoplay", false),
    muted: toggle(p, "muted", false),
    loop: toggle(p, "loop", false),
    title: toggle(p, "title", true),
    controls: toggle(p, "controls", true),
    warningTitle: toggle(p, "warningTitle", true),
    peertubeLink: toggle(p, "peertubeLink", true),
    api: toggle(p, "api", false),
    scope: /^[\w-]{1,64}$/.test(scope) ? scope : "peertube",
  };
}
