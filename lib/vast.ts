export interface VastDocument {
  mediaUrl?: string;
  wrapperUrl?: string;
  duration: number;
  skipAfter: number | null;
  clickThrough?: string;
  impressions: string[];
  errors: string[];
  tracking: Record<string, string[]>;
  clickTracking: string[];
}

const children = (node: Element | undefined, name: string): Element[] =>
  Array.from(node?.children ?? []).filter((child) => child.localName === name);
const child = (node: Element | undefined, name: string) => children(node, name)[0];
const text = (node: Element | undefined) => node?.textContent?.trim() ?? "";

function httpUrl(value: string, baseUrl: string): string | undefined {
  if (!value.trim()) return;
  try {
    const url = new URL(value.trim(), baseUrl);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch { /* Invalid ad URLs are not player or tracking destinations. */ }
}

function clock(value: string): number | null {
  const match = /^(\d{2,}):([0-5]\d):([0-5]\d(?:\.\d+)?)$/.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number.isFinite(seconds) ? seconds : null;
}

function skipOffset(value: string, duration: number): number | null {
  if (!value || duration <= 0) return null;
  const numeric = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
  const percent = value.endsWith("%") ? value.slice(0, -1) : null;
  const seconds = percent !== null && numeric.test(percent)
    ? Number(percent) / 100 * duration
    : numeric.test(value) ? Number(value) : clock(value);
  return seconds !== null && Number.isFinite(seconds) ? Math.min(duration, Math.max(0, seconds)) : null;
}

function urls(node: Element | undefined, name: string, baseUrl: string): string[] {
  return children(node, name).flatMap((element) => {
    const url = httpUrl(text(element), baseUrl);
    return url ? [url] : [];
  });
}

function metadata(body: Element, linear: Element | undefined, baseUrl: string): VastDocument {
  const duration = clock(text(child(linear, "Duration"))) ?? 0;
  const tracking: Record<string, string[]> = Object.create(null);
  for (const element of children(child(linear, "TrackingEvents"), "Tracking")) {
    const event = element.getAttribute("event")?.trim();
    const url = httpUrl(text(element), baseUrl);
    if (event && url && !["__proto__", "constructor", "prototype"].includes(event)) (tracking[event] ??= []).push(url);
  }
  const clicks = child(linear, "VideoClicks");
  return {
    duration,
    skipAfter: skipOffset(linear?.getAttribute("skipoffset")?.trim() ?? "", duration),
    impressions: urls(body, "Impression", baseUrl), errors: urls(body, "Error", baseUrl), tracking,
    clickThrough: urls(clicks, "ClickThrough", baseUrl)[0],
    clickTracking: urls(clicks, "ClickTracking", baseUrl),
  };
}

function linears(body: Element): Element[] {
  return children(child(body, "Creatives"), "Creative")
    .filter((creative) => !creative.getAttribute("apiFramework")?.trim())
    .flatMap((creative) => children(creative, "Linear"));
}

/** Parse one passive video ad; never execute VPAID, SIMID or other ad scripts. */
export function parseVast(xml: string, baseUrl: string): VastDocument | null {
  if (typeof DOMParser === "undefined" || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  let document: Document;
  try { document = new DOMParser().parseFromString(xml, "application/xml"); } catch { return null; }
  if (document.documentElement?.localName !== "VAST" || document.getElementsByTagNameNS("*", "parsererror").length) return null;
  for (const ad of children(document.documentElement, "Ad")) {
    const wrapper = child(ad, "Wrapper");
    if (wrapper) {
      const wrapperUrl = httpUrl(text(child(wrapper, "VASTAdTagURI")), baseUrl);
      if (wrapperUrl) return { ...metadata(wrapper, linears(wrapper)[0], baseUrl), wrapperUrl };
      continue;
    }
    const body = child(ad, "InLine");
    if (!body) continue;
    for (const linear of linears(body)) {
      if (linear.getAttribute("apiFramework")?.trim() || linear.getElementsByTagNameNS("*", "InteractiveCreativeFile").length) continue;
      const result = metadata(body, linear, baseUrl);
      if (result.duration <= 0) continue;
      for (const file of children(child(linear, "MediaFiles"), "MediaFile")) {
        const type = file.getAttribute("type")?.split(";")[0].trim().toLowerCase();
        if (file.getAttribute("apiFramework")?.trim() || (type !== "video/mp4" && type !== "video/webm")) continue;
        const mediaUrl = httpUrl(text(file), baseUrl);
        if (mediaUrl) return { ...result, mediaUrl };
      }
    }
  }
  return null;
}
