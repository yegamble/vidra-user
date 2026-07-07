// Next.js instrumentation hook — runs once per server process before the app
// serves requests (https://nextjs.org/docs/app/api-reference/file-conventions/
// instrumentation). OpenTelemetry is opt-in and zero-cost when off: with
// OTEL_ENABLED unset/false this returns immediately and the OTel SDK is never
// imported, so dev, CI, and production-without-tracing pay nothing.
//
// When enabled it registers the OTel SDK via @vercel/otel so server-side fetches
// to vidra-core carry a W3C `traceparent` that lines up with vidra-core's own
// traces (see .ralph/specs/observability.md §2 and the matching backend spec).
// The OTLP exporter target follows the standard env vars
// (OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_PROTOCOL), which @vercel/otel
// reads; OTEL_SERVICE_NAME defaults to "vidra-user".

export async function register(): Promise<void> {
  if (process.env.OTEL_ENABLED !== "true") {
    return;
  }
  // Only the Node.js server runtime runs the tracing SDK — never the Edge
  // runtime or the browser. The dynamic import keeps the SDK out of the bundle
  // (and off the hot path) when tracing is disabled.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { registerOTel } = await import("@vercel/otel");
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || "vidra-user",
  });
}
