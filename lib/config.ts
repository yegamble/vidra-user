// Typed runtime configuration. Read environment once here so the rest of the app
// imports typed values instead of touching process.env directly.

import { logger } from "@/lib/logger";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// Runtime replacement for the origin checks the publish-container.yml release
// gate used to run before an image could ship (the origin was build-time then;
// it is runtime configuration now, so the gate has to live here). A non-empty
// base URL without an http(s) scheme makes `new URL(base + path)` throw in
// lib/api/client.ts / lib/api/sse.ts on EVERY call — the whole site breaks
// with nothing but console TypeErrors — so it is rejected loudly in favour of
// the safe same-origin default. Loopback origins only warn (server-side, once
// per boot): dev/e2e use them legitimately, but a production deployment
// configured this way makes every browser call the visitor's own machine.
function checkedApiBaseUrl(value: string, source: string): string {
  if (!/^https?:\/\//.test(value)) {
    logger.error(
      `${source} must be an absolute http(s):// URL — new URL() would throw on every API call; ignoring it and serving same-origin relative URLs ("")`,
      { value },
    );
    return "";
  }
  if (typeof window === "undefined" && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(value)) {
    logger.warn(
      `${source} is a loopback origin — fine for local dev/e2e, but in production every browser will call the visitor's own machine`,
      { value },
    );
  }
  return trimTrailingSlash(value);
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
// Configured values are validated by checkedApiBaseUrl above; a malformed one
// is dropped in favour of the safe same-origin default rather than served.
function resolvePublicApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const runtimeConfig = window.__VIDRA_RUNTIME_CONFIG__;
    if (runtimeConfig === undefined && process.env.NODE_ENV === "production") {
      // The route always sets the global, even for the same-origin default —
      // so an absent global means the beforeInteractive /runtime-config.js
      // script itself failed to load, and a cross-origin deployment silently
      // degrades to same-origin for this page load. Warn so the misroute is
      // attributable instead of invisible.
      logger.warn(
        "/runtime-config.js failed to load; falling back to the build-time API base URL for this page load",
      );
    }
    const injected = runtimeConfig?.apiBaseUrl;
    if (injected) return trimTrailingSlash(injected);
  } else if (process.env.PUBLIC_API_BASE_URL) {
    return checkedApiBaseUrl(process.env.PUBLIC_API_BASE_URL, "PUBLIC_API_BASE_URL");
  }
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return checkedApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, "NEXT_PUBLIC_API_BASE_URL");
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
