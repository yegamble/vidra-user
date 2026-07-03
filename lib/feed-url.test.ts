import { describe, expect, it } from "vitest";

import { feedHref, readFeedFilters } from "./feed-url";

describe("feedHref", () => {
  it("maps the bare sort modes to their canonical routes", () => {
    expect(feedHref("recent")).toBe("/");
    expect(feedHref("popular")).toBe("/?sort=popular");
    expect(feedHref("trending")).toBe("/trending");
  });

  it("keeps active filters in the query string for every mode", () => {
    expect(feedHref("recent", { category: "7", language: "en" })).toBe(
      "/?category=7&language=en",
    );
    expect(feedHref("popular", { tag: "cats" })).toBe("/?sort=popular&tag=cats");
    expect(feedHref("trending", { language: "fr" })).toBe("/trending?language=fr");
  });

  it("percent-encodes tag values", () => {
    expect(feedHref("recent", { tag: "cats & dogs" })).toBe("/?tag=cats+%26+dogs");
  });

  it("omits unset filters", () => {
    expect(feedHref("recent", { tag: undefined, category: undefined })).toBe("/");
  });
});

describe("readFeedFilters", () => {
  it("passes set values through and drops empty/blank ones", () => {
    expect(readFeedFilters({ tag: "cats", category: "7", language: "" })).toEqual({
      tag: "cats",
      category: "7",
      language: undefined,
    });
    expect(readFeedFilters({})).toEqual({
      tag: undefined,
      category: undefined,
      language: undefined,
    });
    expect(readFeedFilters({ tag: "  " })).toEqual({
      tag: undefined,
      category: undefined,
      language: undefined,
    });
  });
});
