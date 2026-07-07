// Typed runtime configuration. Read environment once here so the rest of the app
// imports typed values instead of touching process.env directly.

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// Base URL of the vidra-core API. NEXT_PUBLIC_ is inlined at build time and
// exposed to the browser, so it must be a non-secret URL only.
export const apiBaseUrl: string = trimTrailingSlash(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080",
);

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
