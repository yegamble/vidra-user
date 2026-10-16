// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLastPosition, writeLastPosition } from "./last-position";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("last position", () => {
  it("round-trips a mid-watch position", () => {
    writeLastPosition("v1", 42.9, 600);
    expect(readLastPosition("v1", 600)).toBe(42);
  });

  it("ignores trivial and finished positions and clears the entry", () => {
    writeLastPosition("v1", 42, 600);
    writeLastPosition("v1", 590, 600);
    expect(readLastPosition("v1", 600)).toBeNull();
    writeLastPosition("v2", 2, 600);
    expect(readLastPosition("v2", 600)).toBeNull();
  });

  it("rejects corrupt values", () => {
    window.localStorage.setItem("vidra.position.v1", "abc");
    expect(readLastPosition("v1")).toBeNull();
  });

  it("bounds the number of remembered videos, evicting the oldest", () => {
    for (let i = 0; i < 205; i++) writeLastPosition(`v${i}`, 30, 600);
    expect(readLastPosition("v0", 600)).toBeNull();
    expect(readLastPosition("v204", 600)).toBe(30);
  });

  it("survives unavailable storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readLastPosition("v1")).toBeNull();
    expect(() => writeLastPosition("v1", 30, 600)).not.toThrow();
  });
});
