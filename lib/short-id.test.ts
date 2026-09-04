import { describe, expect, it } from "vitest";

import { shortIdToUuid, shortWatchUrl, uuidToShortId } from "./short-id";

// Golden vectors: the base58 encoder behind them was cross-checked against the
// published Bitcoin-alphabet base58 test vectors before these were recorded, so
// a change in encoding shows up here rather than silently breaking old links.
const VECTORS: Array<[string, string]> = [
  ["6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b", "EjArDZ8v19uX6BigXbAx5p"],
  ["0f8fad5b-d9cb-469f-a165-70867728950e", "2vTA15nAkb7x3Sp2dEi3i5"],
  // Leading zero BYTES must survive as leading '1' characters, or the id stops
  // round-tripping (the classic base58 bug).
  ["00000000-0000-4000-8000-000000000001", "1111114bZ6BZRUqUqZep"],
  ["00000000-0000-0000-0000-000000000000", "1111111111111111"],
];

describe("uuidToShortId", () => {
  it("encodes UUIDs to base58 short ids", () => {
    for (const [uuid, sid] of VECTORS) {
      expect(uuidToShortId(uuid)).toBe(sid);
    }
  });

  it("normalizes mixed-case UUID input", () => {
    expect(uuidToShortId("1B4E28BA-2FA1-11D2-883F-0016D3CCA427")).toBe(
      uuidToShortId("1b4e28ba-2fa1-11d2-883f-0016d3cca427"),
    );
  });

  it("rejects anything that is not a UUID", () => {
    expect(uuidToShortId("")).toBeNull();
    expect(uuidToShortId("v1")).toBeNull();
    expect(uuidToShortId("not-a-uuid")).toBeNull();
    // No hyphens, wrong group lengths, non-hex, and stray whitespace.
    expect(uuidToShortId("6f2a1c3d4b5e4f608a719c0d2e3f4a5b")).toBeNull();
    expect(uuidToShortId("6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5")).toBeNull();
    expect(uuidToShortId("6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5bb")).toBeNull();
    expect(uuidToShortId("gf2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b")).toBeNull();
    expect(uuidToShortId(" 6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b")).toBeNull();
  });
});

describe("shortIdToUuid", () => {
  it("decodes short ids back to canonical lowercase UUIDs", () => {
    for (const [uuid, sid] of VECTORS) {
      expect(shortIdToUuid(sid)).toBe(uuid);
    }
  });

  it("round-trips every UUID, lowercasing mixed-case input", () => {
    const uuids = [
      "6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "1B4E28BA-2FA1-11D2-883F-0016D3CCA427",
    ];
    for (const uuid of uuids) {
      const sid = uuidToShortId(uuid);
      expect(sid).not.toBeNull();
      expect(shortIdToUuid(sid as string)).toBe(uuid.toLowerCase());
    }
  });

  it("rejects empty, off-alphabet, and wrong-length ids", () => {
    expect(shortIdToUuid("")).toBeNull();
    // 0, O, I and l are deliberately absent from the base58 alphabet.
    expect(shortIdToUuid("EjArDZ8v19uX6BigXbAx0p")).toBeNull();
    expect(shortIdToUuid("EjArDZ8v19uX6BigXbAxOp")).toBeNull();
    expect(shortIdToUuid("EjArDZ8v19uX6BigXbAxIp")).toBeNull();
    expect(shortIdToUuid("EjArDZ8v19uX6BigXbAxlp")).toBeNull();
    expect(shortIdToUuid("Ej-ArDZ8v19uX6BigXbAx")).toBeNull();
    // Decodes to fewer than 16 bytes.
    expect(shortIdToUuid("2g")).toBeNull();
    expect(shortIdToUuid("111111111111111")).toBeNull();
    // Decodes to more than 16 bytes / longer than any 16-byte encoding.
    expect(shortIdToUuid("zzzzzzzzzzzzzzzzzzzzzz")).toBeNull();
    expect(shortIdToUuid("EjArDZ8v19uX6BigXbAx5pQ")).toBeNull();
  });

  // The contract is null-on-invalid, and the natural caller is
  // `searchParams.get("v")` / a route param, which is `string | null`. Reading
  // `.length` off a non-string throws a TypeError, which in a route handler is
  // a 500 rather than the intended "no such video" — so non-strings must take
  // the same null path as a malformed id.
  it("returns null for non-string input instead of throwing", () => {
    expect(shortIdToUuid(null as unknown as string)).toBeNull();
    expect(shortIdToUuid(undefined as unknown as string)).toBeNull();
    expect(shortIdToUuid(123 as unknown as string)).toBeNull();
    expect(shortIdToUuid({} as unknown as string)).toBeNull();
  });
});

describe("shortWatchUrl", () => {
  const id = "6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b";
  const sid = "EjArDZ8v19uX6BigXbAx5p";

  it("maps the canonical watch path to its short alias", () => {
    expect(shortWatchUrl(id, `/videos/${id}`, "")).toBe(`/v/${sid}`);
  });

  it("carries the query string through verbatim", () => {
    // ?t= is a deep link and ?list= is playlist context; dropping either on the
    // rewrite would silently change what a copied URL does.
    expect(shortWatchUrl(id, `/videos/${id}`, "?t=90")).toBe(`/v/${sid}?t=90`);
    expect(shortWatchUrl(id, `/videos/${id}`, "?t=1m30s&list=abc")).toBe(
      `/v/${sid}?t=1m30s&list=abc`,
    );
  });

  it("leaves the address bar alone when it is already short", () => {
    expect(shortWatchUrl(id, `/v/${sid}`, "")).toBeNull();
  });

  it("leaves any other route alone", () => {
    // An embed, a live page and a remote page all render a watch surface for an
    // id, and none of them is the canonical /videos/{uuid} route.
    expect(shortWatchUrl(id, `/embed/${id}`, "")).toBeNull();
    expect(shortWatchUrl(id, `/live/${id}`, "")).toBeNull();
    expect(shortWatchUrl(id, `/remote/${id}`, "")).toBeNull();
  });

  it("leaves a path for a DIFFERENT video alone", () => {
    // Guards the render-before-navigation window: the effect must not rewrite
    // the URL of the page the browser is actually on to the id it is leaving.
    const other = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(shortWatchUrl(id, `/videos/${other}`, "")).toBeNull();
  });

  it("has no short form for a non-UUID id", () => {
    // Federated and remote videos are addressed by handles, not UUIDs.
    expect(shortWatchUrl("not-a-uuid", "/videos/not-a-uuid", "")).toBeNull();
  });
});
