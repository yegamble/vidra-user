import { describe, expect, it } from "vitest";

import { MAX_TAG_LENGTH, addTags, normalizeTag } from "./tags";

describe("normalizeTag", () => {
  it("lowercases and trims", () => {
    expect(normalizeTag("  Retro Gaming ")).toBe("retro gaming");
  });
});

describe("addTags", () => {
  it("appends a normalized tag", () => {
    expect(addTags([], "Retro")).toEqual({ tags: ["retro"], error: null });
  });

  it("splits comma-separated input and drops empties", () => {
    expect(addTags([], "a, B ,, c")).toEqual({ tags: ["a", "b", "c"], error: null });
  });

  it("dedupes case-insensitively without erroring", () => {
    expect(addTags(["retro"], "RETRO")).toEqual({ tags: ["retro"], error: null });
  });

  it("enforces the 5-tag cap but keeps what fits", () => {
    const { tags, error } = addTags(["a", "b", "c", "d"], "e, f");
    expect(tags).toEqual(["a", "b", "c", "d", "e"]);
    expect(error).toBe("too-many");
  });

  it("rejects over-long tags but keeps valid siblings", () => {
    const long = "x".repeat(MAX_TAG_LENGTH + 1);
    const { tags, error } = addTags([], `ok, ${long}`);
    expect(tags).toEqual(["ok"]);
    expect(error).toBe("too-long");
  });

  it("accepts a tag of exactly the maximum length", () => {
    const max = "y".repeat(MAX_TAG_LENGTH);
    expect(addTags([], max)).toEqual({ tags: [max], error: null });
  });
});
