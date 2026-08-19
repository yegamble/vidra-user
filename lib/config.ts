// Typed runtime configuration. Read environment once here so the rest of the app
// imports typed values instead of touching process.env directly.

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// Runtime browser config, injected by app/runtime-config.js/route.ts and loaded
// beforeInteractive from the root layout — so ONE generic container image can
// serve any origin (the value comes from the server's environment on every page
// load instead of being frozen into the client bundle by `next build`).
declare global {
  interface Window {
    __VIDRA_RUNTIME_CONFIG__?: { apiBaseUrl?: string };
  }
}

// Base URL of the vidra-core API as the BROWSER reaches it. "" means same-origin
// relative URLs — the production single-origin topology, where Caddy routes
// /api/* (and /feeds, /healthz, …) to vidra-core on the page's own origin.
// Resolution order (empty values count as unset throughout this module):
//   1. runtime-injected config (PUBLIC_API_BASE_URL on the running container);
//   2. NEXT_PUBLIC_API_BASE_URL — the dev/e2e override, inlined at build time,
//      so it must be a non-secret URL only;
//   3. "" (same-origin) in production; http://localhost:8080 under dev/test so
//      host-run `npm run dev` and the unit suite need no env at all.
function resolvePublicApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const injected = window.__VIDRA_RUNTIME_CONFIG__?.apiBaseUrl;
    if (injected) return trimTrailingSlash(injected);
  } else if (process.env.PUBLIC_API_BASE_URL) {
    return trimTrailingSlash(process.env.PUBLIC_API_BASE_URL);
  }
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_API_BASE_URL);
  }
  return process.env.NODE_ENV === "production" ? "" : "http://localhost:8080";
}

export const apiBaseUrl: string = resolvePublicApiBaseUrl();

// Server-only calls use compose/service DNS when configured: INTERNAL_API_BASE_URL
// (the historical name the compose files set) or plain API_BASE_URL (the generic
// image's runtime knob) — both read from the environment at server start, never
// inlined. Host-run Next falls back to the same public address, so local npm dev
// needs no extra env; the final localhost fallback keeps server fetches absolute
// when the public base is same-origin relative ("").
export const internalApiBaseUrl: string = trimTrailingSlash(
  process.env.INTERNAL_API_BASE_URL ||
    process.env.API_BASE_URL ||
    (apiBaseUrl !== "" ? apiBaseUrl : "http://localhost:8080"),
);

/**
 * The API base as an ABSOLUTE URL, for callers that must construct `new URL(…)`
 * (lib/api/client.ts, lib/api/sse.ts). With a same-origin relative base ("")
 * the browser resolves against the page's own origin and the server against
 * the internal service address.
 */
export function absoluteApiBaseUrl(): string {
  if (apiBaseUrl !== "") return apiBaseUrl;
  if (typeof window !== "undefined") return window.location.origin;
  return internalApiBaseUrl;
}

// OpenTelemetry is opt-in and zero-cost when off. When OTEL_ENABLED=true,
// instrumentation.ts registers the OTel SDK and every server-side call to
// vidra-core injects a W3C `traceparent` (see lib/observability/trace.ts). When
// off, calls still carry an X-Correlation-ID so logs correlate without tracing.
export const otelEnabled: boolean = process.env.OTEL_ENABLED === "true";

// OTel service identity + OTLP exporter target. All server-side (no
// NEXT_PUBLIC_): tracing runs only in the Node server, never the browser. The
// exporter endpoint/protocol follow the standard OTLP env vars that @vercel/otel
// reads in instrumentation.ts; they are surfaced here for documentation and for
// any server code that needs to reference the configured target.
export const otelServiceName: string = process.env.OTEL_SERVICE_NAME || "vidra-user";
export const otelExporterEndpoint: string | undefined =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined;
export const otelExporterProtocol: string | undefined =
  process.env.OTEL_EXPORTER_OTLP_PROTOCOL || undefined;
