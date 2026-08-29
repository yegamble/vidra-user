import { describe, expect, it } from "vitest";

import { parseStartTime } from "./start-time";

describe("parseStartTime", () => {
  it("parses ?t= whole positive seconds", () => {
    expect(parseStartTime("?t=90")).toBe(90);
    expect(parseStartTime("?t=1")).toBe(1);
    expect(parseStartTime("?foo=bar&t=125")).toBe(125);
  });

  it("rejects absent, empty, zero, negative, fractional, and junk values", () => {
    expect(parseStartTime("")).toBeNull();
    expect(parseStartTime("?foo=bar")).toBeNull();
    expect(parseStartTime("?t=")).toBeNull();
    expect(parseStartTime("?t=0")).toBeNull();
    expect(parseStartTime("?t=-4")).toBeNull();
    expect(parseStartTime("?t=1.5")).toBeNull();
    expect(parseStartTime("?t=abc")).toBeNull();
    expect(parseStartTime("?t=Infinity")).toBeNull();
  });

  it("parses YouTube's h/m/s duration forms", () => {
    expect(parseStartTime("?t=90s")).toBe(90);
    expect(parseStartTime("?t=1m30s")).toBe(90);
    expect(parseStartTime("?t=1h2m3s")).toBe(3723);
    expect(parseStartTime("?t=2h")).toBe(7200);
    expect(parseStartTime("?t=5m")).toBe(300);
    expect(parseStartTime("?t=1h30m")).toBe(5400);
    expect(parseStartTime("?t=1h30s")).toBe(3630);
  });

  it("accepts h/m/s case-insensitively and around surrounding space", () => {
    expect(parseStartTime("?t=1M30S")).toBe(90);
    expect(parseStartTime("?t=2H")).toBe(7200);
    expect(parseStartTime("?t=%201m30s%20")).toBe(90);
  });

  it("rejects malformed h/m/s forms", () => {
    expect(parseStartTime("?t=s")).toBeNull();
    expect(parseStartTime("?t=m30s")).toBeNull();
    expect(parseStartTime("?t=30s1m")).toBeNull();
    expect(parseStartTime("?t=1m1m")).toBeNull();
    expect(parseStartTime("?t=1h2m3s4")).toBeNull();
    expect(parseStartTime("?t=1.5m")).toBeNull();
    expect(parseStartTime("?t=-1m")).toBeNull();
    expect(parseStartTime("?t=0s")).toBeNull();
    expect(parseStartTime("?t=0h0m0s")).toBeNull();
    expect(parseStartTime("?t=1d")).toBeNull();
    expect(parseStartTime("?t=90 s")).toBeNull();
  });
});
