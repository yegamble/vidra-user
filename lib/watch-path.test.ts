import { describe, expect, it } from "vitest";

import type { Video } from "@/lib/api";
import { watchPath } from "@/lib/watch-path";

const CODE = "abcdefghijk";
const ID = "6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b";

describe("watchPath", () => {
  it("prefers the short code", () => {
    expect(watchPath({ id: ID, short_code: CODE } as Video)).toBe(`/v/${CODE}`);
  });

  // The surfaces that carry only a bare video_id — notifications, moderation,
  // admin lists, search suggestions — never have a code, and must keep working.
  it("falls back to the uuid when no code is available", () => {
    expect(watchPath({ id: ID } as Video)).toBe(`/videos/${ID}`);
    expect(watchPath({ id: ID, short_code: undefined } as Video)).toBe(`/videos/${ID}`);
  });

  // A remote federated card has short_code omitted, and core sends "" for those
  // rows in the UNION feed queries, so an empty string must not produce "/v/".
  it("treats an empty code as absent, not as a code", () => {
    expect(watchPath({ id: ID, short_code: "" } as Video)).toBe(`/videos/${ID}`);
  });

  it("appends a query to whichever form it produced", () => {
    expect(watchPath({ id: ID, short_code: CODE } as Video, "?src=related")).toBe(
      `/v/${CODE}?src=related`,
    );
    expect(watchPath({ id: ID } as Video, "?src=related")).toBe(`/videos/${ID}?src=related`);
  });

  // The oembed discovery url embeds this as a query PARAMETER, where an
  // unescaped space truncates the value. The previous inline construction
  // encoded the id; this must not quietly stop.
  it("encodes the identifier it emits", () => {
    expect(watchPath({ id: "a b" } as Video)).toBe("/videos/a%20b");
    expect(watchPath({ id: "x", short_code: "a b" } as Video)).toBe("/v/a%20b");
  });
});
