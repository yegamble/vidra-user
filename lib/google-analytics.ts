type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

export function analyticsPage(pathname: string): string | null {
  if (["/", "/trending", "/search", "/about"].includes(pathname)) return pathname;
  const category = /^\/(videos|channels|users|playlists|live|remote)\/[^/?#]+$/.exec(pathname);
  return category ? `/${category[1]}` : null;
}

type Visit = { pathname: string; page: string };
type Tag = { id: string; loaded: boolean; visit: Visit | null; sent: string | null };
let active: Tag | null = null;
let consentInitialized = false;
const tags = new Map<string, Tag>();
const validId = /^G-[A-Z0-9]{4,20}$/;
const titles: Record<string, string> = { "/": "Home", "/trending": "Trending", "/search": "Search", "/about": "About" };

function send(...args: unknown[]) {
  try { window.gtag?.(...args); } catch { /* Analytics must never break navigation. */ }
}

function pageFields(page: string) {
  return {
    page_location: `${location.origin}${page}`,
    page_title: titles[page] ?? page.slice(1, 2).toUpperCase() + page.slice(2),
    page_referrer: "",
  };
}
function emit(tag: Tag) {
  if (active !== tag || !tag.loaded || !tag.visit || tag.sent === tag.visit.pathname) return;
  const fields = pageFields(tag.visit.page);
  send("set", fields);
  send("event", "page_view", { send_to: tag.id, ...fields });
  tag.sent = tag.visit.pathname;
}

/** Caller passes null unless the instance and this visitor both opted in.
 * Enhanced Measurement must also be OFF in the GA stream (see README).
 * Raw paths are used only for local deduplication, never sent to Google. */
export function syncGoogleAnalytics(id: string | null, pathname: string, nonce: string) {
  const page = analyticsPage(pathname);
  if (!id || !validId.test(id) || !page) {
    if (active) {
      window[`ga-disable-${active.id}`] = true;
      active.visit = null;
      active.sent = null;
      active = null;
      send("consent", "update", { analytics_storage: "denied" });
    }
    return;
  }
  if (active && active.id !== id) syncGoogleAnalytics(null, pathname, nonce);
  window[`ga-disable-${id}`] = false;
  window.dataLayer ??= [];
  // eslint-disable-next-line prefer-rest-params -- gtag.js consumes IArguments commands.
  window.gtag ??= function () { window.dataLayer!.push(arguments); } as Gtag;
  if (!consentInitialized) {
    send("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    consentInitialized = true;
  }
  send("consent", "update", { analytics_storage: "granted" });
  const existing = tags.get(id);
  if (existing) {
    active = existing;
    existing.visit = { pathname, page };
    emit(existing);
    return;
  }
  const tag: Tag = { id, loaded: false, visit: { pathname, page }, sent: null };
  tags.set(id, tag);
  active = tag;
  send("set", pageFields(page));
  send("js", new Date());
  send("config", id, { ...pageFields(page), send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = document.createElement("script");
  script.dataset.vidraAnalytics = id;
  script.nonce = nonce;
  script.async = true;
  script.referrerPolicy = "no-referrer";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  script.onload = () => { tag.loaded = true; emit(tag); };
  // A blocked tag has no effect on the application and creates no retry loop.
  script.onerror = () => { tag.visit = null; };
  document.head.appendChild(script);
}
