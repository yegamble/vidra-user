// Global response hardening. The CSP is ENFORCED, and built per request in
// proxy.ts: script-src carries a fresh nonce, which a build-time next.config
// header cannot — it could only allow inline scripts via 'unsafe-inline'.

/** Same-origin path of the violation sink (app/csp-report/route.ts). Not under
 *  /api/: in the single-origin topology Caddy routes /api/* to vidra-core. */
export const CSP_REPORT_PATH = "/csp-report";
/** Reporting-Endpoints group name the policy's report-to names. */
export const CSP_REPORT_GROUP = "csp";
export const REPORTING_ENDPOINTS = `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`;

export type CspOptions = {
  nonce: string;
  /** Cross-origin API origin (custom.js/css are served there); null = same-origin. */
  apiOrigin: string | null;
  /** /embed exists to be iframed by any site; nothing else does. */
  frameable: boolean;
  isDev: boolean;
};

export function buildContentSecurityPolicy({ nonce, apiOrigin, frameable, isDev }: CspOptions) {
  const api = apiOrigin ? ` ${apiOrigin}` : "";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    // 'strict-dynamic' (Next CSP guide): nonced scripts may load more — Next
    // chunks, olm.js, an operator custom.js's own loads. CSP3 browsers then
    // ignore 'self' and the API origin (kept for older ones). Dev needs eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${api}${isDev ? " 'unsafe-eval'" : ""}`,
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
