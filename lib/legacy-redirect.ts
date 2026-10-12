// Query-string translation for PeerTube's legacy public URLs.
//
// A PeerTube link says `?start=1m30s` where vidra says `?t=1m30s`; both parse
// with parseStartTime (seconds or h/m/s). Everything else rides along verbatim
// on watch links, as it always has. The embed is stricter: it understands only
// `t`, so a PeerTube iframe's autoplay/muted/loop/stop/title/... are dropped
// rather than forwarded into a URL that ignores them.

function mapStart(params: URLSearchParams): void {
  const start = params.get("start");
  params.delete("start");
  // An explicit `t` wins: it is already vidra's own form.
  if (start !== null && start !== "" && !params.has("t")) params.set("t", start);
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

/** legacyEmbedSearch keeps only what vidra's embed understands: `t`. */
export function legacyEmbedSearch(search: string): string {
  const params = new URLSearchParams(search);
  mapStart(params);
  const t = params.get("t");
  return t === null ? "" : toSearch(new URLSearchParams({ t }));
}
