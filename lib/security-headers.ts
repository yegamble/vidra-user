// Global response hardening. The CSP is ENFORCED, and built per request in
// proxy.ts: script-src carries a fresh nonce, which a build-time next.config
// header cannot — it could only allow inline scripts via 'unsafe-inline'.

/** Same-origin path of the violation sink (app/csp-report/route.ts). Not under
 *  /api/: in the single-origin topology Caddy routes /api/* to vidra-core. */
const CSP_REPORT_PATH = "/csp-report";
/** Reporting-Endpoints group name the policy's report-to names. */
const CSP_REPORT_GROUP = "csp";
const REPORTING_ENDPOINTS = `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`;

export type CspOptions = {
  nonce: string;
  /** Cross-origin API origin (custom.js/css are served there); null = same-origin. */
  apiOrigin: string | null;
  /** /embed exists to be iframed by any site; nothing else does. */
  frameable: boolean;
  isDev: boolean;
  /** Operator allowances; omitted = none. */
  allow?: CspAllowances;
};

/**
 * Operator-granted relaxations of the enforced policy, each its own switch and
 * all off by default. Third-party tags an operator adds through custom.js (ad
 * networks, widgets) often cannot run under the strict policy; before these the
 * only way out was CSP_REPORT_ONLY, which drops the WHOLE policy, clickjacking
 * protection included. Each one gives up a specific protection, so an operator
 * turns on exactly what a tag was measured to need and nothing else.
 */
type CspAllowances = {
  /** 'unsafe-eval' on script-src, for tags that unpack themselves with eval(). */
  evalScripts: boolean;
  /** Inline on*="…" attributes in markup a tag injects. The costliest of the
   *  three: injected HTML with an event handler runs again. */
  inlineEventHandlers: boolean;
  /** Sources frames may load from besides this site, e.g. ["https:"]. */
  frameSources: string[];
};

const NO_ALLOWANCES: CspAllowances = { evalScripts: false, inlineEventHandlers: false, frameSources: [] };

// One https scheme-source or https host-source. Everything else is dropped —
// quotes, ';', ',', keywords, http:, a bare '*' — so the value can widen
// frame-src and can never smuggle in another directive.
const FRAME_SOURCE = /^https:(\/\/(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?)?$/i;

/** Reads CSP_ALLOW_EVAL, CSP_ALLOW_INLINE_EVENT_HANDLERS and CSP_FRAME_SRC from
 *  the container environment (README). Only the literal "true" switches one
 *  on, as with CSP_REPORT_ONLY. */
export function cspAllowancesFromEnv(env: Record<string, string | undefined>): CspAllowances {
  return {
    evalScripts: env.CSP_ALLOW_EVAL === "true",
    inlineEventHandlers: env.CSP_ALLOW_INLINE_EVENT_HANDLERS === "true",
    frameSources: (env.CSP_FRAME_SRC ?? "").split(/\s+/).filter((source) => FRAME_SOURCE.test(source)),
  };
}

/**
 * isFrameablePath: the paths any site may iframe. /embed, plus PeerTube's legacy
 * iframe paths — their redirect response must be frameable too, or the browser
 * blocks the iframe at the hop.
 */
export function isFrameablePath(pathname: string): boolean {
  return ["/embed", "/videos/embed", "/video-playlists/embed"].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function buildContentSecurityPolicy({ nonce, apiOrigin, frameable, isDev, allow = NO_ALLOWANCES }: CspOptions) {
  const api = apiOrigin ? ` ${apiOrigin}` : "";
  const evalSource = isDev || allow.evalScripts ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    // 'strict-dynamic' (Next CSP guide): nonced scripts may load more — Next
    // chunks, olm.js, an operator custom.js's own loads. CSP3 browsers then
    // ignore 'self' and the API origin (kept for older ones). Dev needs eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${api}${evalSource}`,
    // No nonce: it would switch off 'unsafe-inline' for pervasive style attributes.
    `style-src 'self' 'unsafe-inline'${api}`,
    "font-src 'self' data:",
    "img-src 'self' data: blob: http: https:",
    "media-src 'self' data: blob: http: https:",
    "connect-src 'self' http: https: ws: wss:",
    // hls.js creates its demux worker from a blob URL. Omitting blob: here makes
    // it fall back to main-thread work and reintroduces playback frame drops.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // Its own directive on purpose: next to a nonce, 'unsafe-inline' in script-src
    // is ignored (and must stay so); script-src-attr covers attributes only.
    ...(allow.inlineEventHandlers ? ["script-src-attr 'unsafe-inline'"] : []),
    // Without frame-src, default-src 'self' governs frames.
    ...(allow.frameSources.length > 0 ? [`frame-src 'self' ${allow.frameSources.join(" ")}`] : []),
    // Clickjacking: only this site frames the app; /embed sends no frame-ancestors.
    ...(frameable ? [] : ["frame-ancestors 'self'"]),
    // report-to for current browsers; report-uri for those without the Reporting API.
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join("; ");
}

/** The API origin when the API is cross-origin; null for "" or anything odd. */
export function apiOriginOf(apiBaseUrl: string): string | null {
  try {
    const url = new URL(apiBaseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** CSP_REPORT_ONLY=true is the operator's escape hatch (README): an admin
 *  custom.js the enforced policy breaks is recovered by an env change and a
 *  container RECREATE (`vidra deploy`; `vidra restart` keeps the old env), no
 *  rebuild — the same policy is then only reported. */
export function cspHeaderName(reportOnly: string | undefined) {
  return reportOnly === "true" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

export const SECURITY_HEADERS = [
  { key: "Reporting-Endpoints", value: REPORTING_ENDPOINTS },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
] as const;

// Strict-Transport-Security is deliberately NOT in the list above. Every other
// header is a constant, but this one depends on how the operator terminates
// TLS, and next.config's headers() is evaluated when the image is BUILT while
// the origin is only known when the container RUNS — one generic image has to
// serve both an https deployment and the deliberate plain-http mode
// (lab/LAN/air-gap, VIDRA_TLS_MODE=plain-http). So proxy.ts (Next 16's name for
// middleware) emits it per-request from the runtime environment instead.
export const STRICT_TRANSPORT_SECURITY = {
  key: "Strict-Transport-Security",
  value: "max-age=31536000; includeSubDomains",
} as const;

/**
 * Whether this deployment may advertise HSTS, decided by the scheme of the SITE
 * origin — PUBLIC_BASE_URL, a server-side variable. (Not PUBLIC_API_BASE_URL:
 * that is the API origin the browser calls, a different concept.)
 *
 * Fail secure in every ambiguous case. Per RFC 6797 a browser ignores an HSTS
 * header received over plain HTTP, so over-emitting it is inert; under-emitting
 * it on a real TLS deployment silently drops a year of transport protection and
 * reopens the first-request downgrade. Only an explicit `http://` origin — the
 * operator having said out loud that this instance runs without TLS — suppresses
 * the header. Unset, https, and unparseable all emit.
 */
export function shouldSendHsts(publicBaseUrl: string | undefined): boolean {
  if (!publicBaseUrl) return true;
  try {
    return new URL(publicBaseUrl).protocol !== "http:";
  } catch {
    return true;
  }
}
