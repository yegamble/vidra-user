import { describe, expect, it } from "vitest";

import { COUNTRIES } from "./countries";

describe("COUNTRIES", () => {
  it("covers the full ISO 3166-1 alpha-2 assigned set", () => {
    expect(COUNTRIES.length).toBe(249);
  });

  it("uses unique, well-formed alpha-2 codes", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("carries a non-empty English display name per entry", () => {
    for (const c of COUNTRIES) {
      expect(c.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("is sorted by English display name", () => {
    const names = COUNTRIES.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "en"));
    expect(names).toEqual(sorted);
  });

  it("resolves well-known countries", () => {
    const byCode = new Map(COUNTRIES.map((c) => [c.code, c.name]));
    expect(byCode.get("DE")).toBe("Germany");
    expect(byCode.get("US")).toBe("United States");
    expect(byCode.get("JP")).toBe("Japan");
    expect(byCode.get("BR")).toBe("Brazil");
  });
});
