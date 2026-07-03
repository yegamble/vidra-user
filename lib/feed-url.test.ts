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

  it("keeps scope=all explicit and the default local scope out of the URL", () => {
    expect(feedHref("recent", { scope: "all" })).toBe("/?scope=all");
    expect(feedHref("popular", { scope: "all", tag: "cats" })).toBe(
      "/?sort=popular&scope=all&tag=cats",
    );
    expect(feedHref("recent", { scope: undefined })).toBe("/");
  });
});

describe("readFeedFilters", () => {
  it("passes set values through and drops empty/blank ones", () => {
    expect(readFeedFilters({ tag: "cats", category: "7", language: "" })).toEqual({
      tag: "cats",
      category: "7",
      language: undefined,
      scope: undefined,
    });
    expect(readFeedFilters({})).toEqual({
      tag: undefined,
      category: undefined,
      language: undefined,
      scope: undefined,
    });
    expect(readFeedFilters({ tag: "  " })).toEqual({
      tag: undefined,
      category: undefined,
      language: undefined,
      scope: undefined,
    });
  });

  it("normalizes scope: only 'all' is kept, anything else is the local default", () => {
    expect(readFeedFilters({ scope: "all" }).scope).toBe("all");
    expect(readFeedFilters({ scope: "local" }).scope).toBeUndefined();
    expect(readFeedFilters({ scope: "bogus" }).scope).toBeUndefined();
  });
});
