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
});
