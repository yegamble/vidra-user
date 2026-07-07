import {
  context,
  type Context,
  type ContextManager,
  propagation,
  ROOT_CONTEXT,
  trace,
  TraceFlags,
} from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { afterEach, describe, expect, it } from "vitest";

import { activeTraceFields, injectTraceContext } from "./trace";

// A minimal synchronous context manager so `context.with(ctx, fn)` makes a span
// the active one for the duration of the (synchronous) callback. This is enough
// to drive injectTraceContext/activeTraceFields, which read `context.active()`,
// without pulling in @opentelemetry/context-async-hooks for a unit test.
class SyncStackContextManager implements ContextManager {
  private active_: Context = ROOT_CONTEXT;
  active(): Context {
    return this.active_;
  }
  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    ctx: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const previous = this.active_;
    this.active_ = ctx;
    try {
      return fn.call(thisArg, ...args);
    } finally {
      this.active_ = previous;
    }
  }
  bind<T>(_ctx: Context, target: T): T {
    return target;
  }
  enable(): this {
    return this;
  }
  disable(): this {
    this.active_ = ROOT_CONTEXT;
    return this;
  }
}

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const SPAN_ID = "b7ad6b7169203331";

function withActiveSpan<T>(fn: () => T): T {
  const ctx = trace.setSpanContext(context.active(), {
    traceId: TRACE_ID,
    spanId: SPAN_ID,
    traceFlags: TraceFlags.SAMPLED,
    isRemote: false,
  });
  return context.with(ctx, fn);
}

describe("trace helpers — OTel disabled (no SDK/propagator registered)", () => {
  it("injectTraceContext writes nothing (X-Correlation-ID stays the sole carrier)", () => {
    const headers: Record<string, string> = { "x-correlation-id": "abc" };
    injectTraceContext(headers);
    expect(headers).toEqual({ "x-correlation-id": "abc" });
    expect(headers.traceparent).toBeUndefined();
  });

  it("activeTraceFields returns an empty object", () => {
    expect(activeTraceFields()).toEqual({});
  });
});

describe("trace helpers — OTel enabled (W3C propagator + active span)", () => {
  afterEach(() => {
    // Reset the global OTel state so the disabled-path assertions elsewhere and
    // other test files are unaffected.
    propagation.disable();
    context.disable();
  });

  it("injectTraceContext adds a W3C traceparent for the active span", () => {
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    context.setGlobalContextManager(new SyncStackContextManager());

    const headers: Record<string, string> = {};
    withActiveSpan(() => injectTraceContext(headers));

    expect(headers.traceparent).toBe(`00-${TRACE_ID}-${SPAN_ID}-01`);
  });

  it("only adds trace-context keys — existing headers are untouched", () => {
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    context.setGlobalContextManager(new SyncStackContextManager());

    const headers: Record<string, string> = { "x-correlation-id": "abc" };
    withActiveSpan(() => injectTraceContext(headers));

    expect(headers["x-correlation-id"]).toBe("abc");
    expect(headers.traceparent).toBeDefined();
  });

  it("activeTraceFields returns the active span's trace_id/span_id", () => {
    context.setGlobalContextManager(new SyncStackContextManager());
    const fields = withActiveSpan(() => activeTraceFields());
    expect(fields).toEqual({ trace_id: TRACE_ID, span_id: SPAN_ID });
  });
});
