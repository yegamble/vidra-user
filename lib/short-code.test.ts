import { describe, expect, it } from "vitest";

import { isShortCode, SHORT_CODE_LENGTH } from "@/lib/short-code";
import { uuidToShortId } from "@/lib/short-id";

describe("isShortCode", () => {
  it("accepts exactly 11 base58 characters", () => {
    expect(isShortCode("abcdefghijk")).toBe(true);
    expect(isShortCode("123456789AB")).toBe(true);
    expect(isShortCode("zzzzzzzzzzz")).toBe(true);
  });

  it("rejects any other length", () => {
    expect(isShortCode("")).toBe(false);
    expect(isShortCode("abcdefghij")).toBe(false); // 10
    expect(isShortCode("abcdefghijkl")).toBe(false); // 12
  });

  it("rejects the characters base58 leaves out", () => {
    for (const bad of ["0", "O", "I", "l"]) {
      expect(isShortCode("abcdefghij" + bad)).toBe(false);
    }
    expect(isShortCode("abcdefghi-j")).toBe(false);
    expect(isShortCode("abcdefghij ")).toBe(false);
  });

  // The property the /v/ route depends on: a DERIVED sid is never mistaken for
  // a STORED code, because their length ranges do not overlap. If this ever
  // fails, /v/ has become ambiguous and the route must stop guessing by length.
  it("never accepts a derived sid, for any uuid", () => {
    const uuids = [
      "6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b",
      "0f8fad5b-d9cb-469f-a165-70867728950e",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
    ];
    for (const u of uuids) {
      const sid = uuidToShortId(u);
      expect(sid).not.toBeNull();
      expect(sid!.length).toBeGreaterThan(SHORT_CODE_LENGTH);
      expect(isShortCode(sid!)).toBe(false);
    }
  });
});
