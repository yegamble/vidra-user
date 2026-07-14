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
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
] as const;
