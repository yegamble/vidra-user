// Trace-context helpers for the vidra-user → vidra-core correlation contract.
// See .ralph/specs/observability.md §2 ("Trace propagation to the backend").
//
// These are no-op-safe. With no OpenTelemetry SDK registered — the default,
// OTEL_ENABLED unset — @opentelemetry/api's global propagator is a no-op and
// getActiveSpan() returns undefined, so injectTraceContext writes nothing and
// activeTraceFields returns {}. Nothing here loads the OTel SDK, so importing
// this module is zero-cost with tracing off. When instrumentation.ts registers
// the SDK (OTEL_ENABLED=true), the active span's W3C `traceparent` is injected
// on outbound calls to vidra-core — which is configured to accept it — and its
// trace_id/span_id become available to stamp into server logs.
//
// Security: the injected headers carry only trace/span ids and sampling flags —
// never tokens, cookies, PII, or message plaintext.

import { context, isSpanContextValid, propagation, trace } from "@opentelemetry/api";

/**
 * injectTraceContext writes W3C trace-context headers (`traceparent`, and
 * `tracestate` when present) for the currently-active span into the given header
 * carrier, using the globally-registered propagator. It is a no-op when no
 * propagator/SDK is registered or no span is active, so it costs nothing with
 * OTel disabled. The carrier is mutated in place; existing headers are untouched
 * (the propagator only sets the trace-context keys).
 */
export function injectTraceContext(headers: Record<string, string>): void {
  propagation.inject(context.active(), headers, {
    set(carrier, key, value) {
      (carrier as Record<string, string>)[key] = value;
    },
  });
}

/**
 * activeTraceFields returns the active span's `trace_id`/`span_id` for stamping
 * into structured logs, or an empty object when no valid span is active (OTel
 * off). Pairs with the always-on `correlation_id` so logs correlate whether or
 * not full tracing is enabled.
 */
export function activeTraceFields(): { trace_id?: string; span_id?: string } {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const spanContext = span.spanContext();
  if (!isSpanContextValid(spanContext)) return {};
  return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
}
