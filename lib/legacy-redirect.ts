import { EMBED_PARAM_KEYS } from "@/lib/embed-params";

// Query-string translation for PeerTube's legacy public URLs.
//
// A PeerTube link says `?start=1m30s` where vidra says `?t=1m30s`; both parse
// with parseStartTime (seconds or h/m/s). Everything else rides along verbatim
// on watch links, as it always has. The embed carries only the options it
// understands (lib/embed-params), not arbitrary params.

function mapStart(params: URLSearchParams): void {
  const start = params.get("start");
  params.delete("start");
  // An explicit non-empty `t` wins: it is already vidra's own form. An empty
  // `t` carries no time, so it must not suppress `start`.
  if (start !== null && start !== "" && (params.get("t") ?? "") === "") params.set("t", start);
}

function toSearch(params: URLSearchParams): string {
  const s = params.toString();
  return s === "" ? "" : `?${s}`;
}

/** legacyWatchSearch maps `start`→`t` and keeps every other param. */
export function legacyWatchSearch(search: string): string {
  const params = new URLSearchParams(search);
  mapStart(params);
  return toSearch(params);
}

/**
 * legacyEmbedSearch maps `start`→`t` and carries PeerTube's embed options
 * (EMBED_PARAM_KEYS) through. Anything else is dropped, and so is a value that is
 * not short and word-shaped: the embed re-validates, but a redirect should not
 * relay arbitrary text into a Location header.
 */
export function legacyEmbedSearch(search: string): string {
  const params = new URLSearchParams(search);
  mapStart(params);
  const out = new URLSearchParams();
  for (const key of ["t", ...EMBED_PARAM_KEYS]) {
    const v = params.get(key);
    if (v !== null && /^[\w-]{1,64}$/.test(v)) out.set(key, v);
  }
  return toSearch(out);
}
