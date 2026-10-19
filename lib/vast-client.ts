import { parseVast, type VastDocument } from "./vast";
export type { VastDocument } from "./vast";

const MAX_XML_BYTES = 1024 * 1024;
const MAX_WRAPPERS = 3;
const DEADLINE_MS = 6000;

function httpUrl(value: string, base?: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value, base ?? (typeof location === "undefined" ? undefined : location.href));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

async function readXml(response: Response, signal: AbortSignal): Promise<string | null> {
  if (Number(response.headers.get("Content-Length")) > MAX_XML_BYTES || !response.body) return null;
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) return signal.aborted ? null : text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_XML_BYTES) { cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    return null;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function merge(wrappers: VastDocument[], inline: VastDocument): VastDocument {
  const layers = [...wrappers, inline];
  const tracking: Record<string, string[]> = Object.create(null);
  for (const layer of layers) {
    for (const [event, urls] of Object.entries(layer.tracking)) (tracking[event] ??= []).push(...urls);
  }
  const nearest = [...wrappers].reverse();
  const skip = inline.skipAfter ?? nearest.find(layer => layer.skipAfter !== null)?.skipAfter;
  return {
    ...inline,
    impressions: layers.flatMap(layer => layer.impressions),
    errors: layers.flatMap(layer => layer.errors),
    clickTracking: layers.flatMap(layer => layer.clickTracking),
    tracking,
    clickThrough: inline.clickThrough ?? nearest.find(layer => layer.clickThrough)?.clickThrough,
    skipAfter: skip == null ? null : Math.min(inline.duration, Math.max(0, skip)),
  };
}

async function resolveTag(tagUrl: string, signal: AbortSignal): Promise<VastDocument | null> {
  let url = httpUrl(tagUrl);
  const seen = new Set<string>();
  const wrappers: VastDocument[] = [];
  for (let depth = 0; url && depth <= MAX_WRAPPERS && !signal.aborted; depth++) {
    if (seen.has(url)) return null;
    seen.add(url);
    // Ad servers never receive application cookies, bearer tokens or referrers.
    const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok || signal.aborted) return null;
    const base = httpUrl(response.url || url);
    if (!base || (base !== url && seen.has(base))) return null;
    seen.add(base);
    const xml = await readXml(response, signal);
    if (xml === null || signal.aborted) return null;
    const document = parseVast(xml, base);
    if (!document) return null;
    if (document.mediaUrl) return merge(wrappers, document);
    wrappers.push(document);
    url = document.wrapperUrl ? httpUrl(document.wrapperUrl, base) : null;
  }
  return null;
}

/** One deadline covers fetches, streamed bodies and every wrapper. Ads fail open. */
export async function loadVast(tagUrl: string, signal: AbortSignal): Promise<VastDocument | null> {
  if (signal.aborted) return null;
  const controller = new AbortController();
  let stop!: () => void;
  const stopped = new Promise<null>(resolve => { stop = () => { controller.abort(); resolve(null); }; });
  const timer = setTimeout(stop, DEADLINE_MS);
  signal.addEventListener("abort", stop, { once: true });
  try {
    return await Promise.race([resolveTag(tagUrl, controller.signal).catch(() => null), stopped]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    controller.abort();
  }
}

/** Passive, best-effort beacons; blocked tracking must never interrupt playback. */
export function trackVast(urls: string[], errorCode: string | number = 900): void {
  const macros: Record<string, string> = {
    ERRORCODE: String(errorCode), TIMESTAMP: new Date().toISOString(),
    CACHEBUSTING: String(Math.floor(10_000_000 + Math.random() * 90_000_000)),
  };
  macros.CACHEBUSTER = macros.RANDOM = macros.CACHEBUSTING;
  for (const raw of urls) {
    try {
      const expanded = raw.replace(/(?:\[|%5B)(ERRORCODE|TIMESTAMP|CACHEBUSTING|CACHEBUSTER|RANDOM)(?:\]|%5D)/gi,
        (_, name: string) => encodeURIComponent(macros[name.toUpperCase()]));
      const url = httpUrl(expanded);
      if (url) void fetch(url, {
        credentials: "omit", referrerPolicy: "no-referrer", mode: "no-cors", keepalive: true,
      }).catch(() => {});
    } catch { /* Invalid URLs, synchronous fetch failures and blockers are harmless. */ }
  }
}
