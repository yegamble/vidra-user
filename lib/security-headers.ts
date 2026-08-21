// Global response hardening. The CSP deliberately starts in report-only mode:
// Vidra supports operator-configured backend/IPFS media origins and third-party
// framing of /embed, so enforcement should follow observation in real deploys.

export const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: http: https:",
  "media-src 'self' data: blob: http: https:",
  "connect-src 'self' http: https: ws: wss:",
  // hls.js creates its demux worker from a blob URL. Omitting blob: here makes
  // it fall back to main-thread work and reintroduces playback frame drops.
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

export const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy-Report-Only",
    value: CONTENT_SECURITY_POLICY_REPORT_ONLY,
  },
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
