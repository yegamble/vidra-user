import { describe, expect, it } from "vitest";

import {
  activeSearchFilterCount,
  readSearchFilters,
  readSearchType,
  searchApiFilters,
  searchFilterKey,
  searchHref,
} from "./search-url";

describe("searchHref", () => {
  it("keeps the query first and appends active filters", () => {
    expect(searchHref("go")).toBe("/search?q=go");
    expect(searchHref("go", { category: "7" })).toBe("/search?q=go&category=7");
    expect(searchHref("go", { category: "7", language: "en", tag: "cats" })).toBe(
      "/search?q=go&category=7&language=en&tag=cats",
    );
    expect(searchHref("go", { language: "en", license: "7" })).toBe(
      "/search?q=go&language=en&license=7",
    );
  });

  it("URL-encodes the query and tag", () => {
    expect(searchHref("cats & dogs", { tag: "a b" })).toBe("/search?q=cats+%26+dogs&tag=a+b");
  });

  it("omits unset filters and an empty query", () => {
    expect(searchHref("", {})).toBe("/search");
    expect(searchHref("", { category: "7" })).toBe("/search?category=7");
    expect(searchHref("go", { category: undefined })).toBe("/search?q=go");
  });

  it("carries the new facets, and omits the ones that are already the default", () => {
    expect(
      searchHref("go", {
        sort: "-views",
        duration: "short",
        published: "7d",
        tagsAll: ["ocean", "reef"],
        tagsOne: ["1970s"],
      }),
    ).toBe("/search?q=go&sort=-views&duration=short&published=7d&tags_all=ocean%2Creef&tags_one=1970s");
    // Relevance is the endpoint's own default; the videos tab is this page's.
    expect(searchHref("go", { sort: "relevance" }, "videos")).toBe("/search?q=go");
    expect(searchHref("go", {}, "channels")).toBe("/search?q=go&type=channels");
  });
});

describe("readSearchFilters", () => {
  it("extracts filters and normalizes empty strings to undefined", () => {
    expect(
      readSearchFilters({ category: "7", language: "en", license: "1", tag: "cats" }),
    ).toMatchObject({
      category: "7",
      language: "en",
      license: "1",
      tag: "cats",
    });
    expect(
      readSearchFilters({ category: "  ", language: "", license: "  ", tag: undefined }),
    ).toMatchObject({
      category: undefined,
      language: undefined,
      license: undefined,
      tag: undefined,
    });
  });

  it("drops a value the endpoint would answer with a 400 rather than forwarding it", () => {
    // A hand-edited URL degrades to the default view, never to an error page.
    expect(readSearchFilters({ sort: "-likes" }).sort).toBeUndefined();
    expect(readSearchFilters({ duration: "epic" }).duration).toBeUndefined();
    expect(readSearchFilters({ published: "last-week" }).published).toBeUndefined();
    expect(readSearchFilters({ sort: "-views" }).sort).toBe("-views");
  });

  it("splits, lowercases and de-dupes the tag lists", () => {
    expect(readSearchFilters({ tags_all: "Ocean, reef ,ocean" }).tagsAll).toEqual([
      "ocean",
      "reef",
    ]);
    expect(readSearchFilters({ tags_one: " , " }).tagsOne).toBeUndefined();
  });

  it("survives a repeated key, which reaches a page as an array", () => {
    // `?category=1&category=2` would otherwise call .trim() on an array and
    // turn a hand-typed URL into a 500. Last value wins.
    expect(readSearchFilters({ category: ["1", "2"], tag: ["a"] })).toMatchObject({
      category: "2",
      tag: "a",
    });
    expect(readSearchFilters({ duration: ["nonsense", "long"] }).duration).toBe("long");
    // Repeatable AND comma-separated are equivalent for the tag lists, exactly
    // as the endpoint documents them.
    expect(readSearchFilters({ tags_all: ["a", "b"] }).tagsAll).toEqual(["a", "b"]);
    expect(readSearchType(["accounts"])).toBe("accounts");
  });

  it("ignores params it does not own, so the whole query bag can be passed in", () => {
    const filters = readSearchFilters({ q: "go", type: "channels", limit: "50", category: "7" });
    expect(filters.category).toBe("7");
    expect(Object.values(filters).filter(Boolean)).toEqual(["7"]);
  });
});

describe("readSearchType", () => {
  it("accepts the three result kinds and falls back to videos", () => {
    expect(readSearchType("channels")).toBe("channels");
    expect(readSearchType("accounts")).toBe("accounts");
    expect(readSearchType("videos")).toBe("videos");
    expect(readSearchType("playlists")).toBe("videos");
    expect(readSearchType(undefined)).toBe("videos");
  });
});

describe("activeSearchFilterCount", () => {
  it("counts every applied facet, including a non-default sort", () => {
    expect(activeSearchFilterCount({})).toBe(0);
    expect(activeSearchFilterCount({ sort: "relevance" })).toBe(0);
    expect(activeSearchFilterCount({ sort: "-views" })).toBe(1);
    expect(
      activeSearchFilterCount({
        category: "7",
        language: "en",
        license: "1",
        tag: "cats",
        sort: "-published_at",
        duration: "short",
        published: "today",
        tagsAll: ["a"],
        tagsOne: ["b"],
      }),
    ).toBe(9);
    // An empty list is not a filter.
    expect(activeSearchFilterCount({ tagsAll: [] })).toBe(0);
  });
});

describe("searchFilterKey", () => {
  it("changes with any facet and ignores the result type", () => {
    const base = searchFilterKey("go", {});
    expect(searchFilterKey("go", {})).toBe(base);
    expect(searchFilterKey("go", { duration: "long" })).not.toBe(base);
    expect(searchFilterKey("rust", {})).not.toBe(base);
  });
});

describe("searchApiFilters", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("passes the taxonomy ids through untouched", () => {
    expect(searchApiFilters({ category: "7", language: "en", license: "1" }, now)).toMatchObject({
      category: "7",
      language: "en",
      license: "1",
    });
    expect(searchApiFilters({}, now).license).toBeUndefined();
  });

  it("expands a duration bucket into inclusive second bounds that do not overlap", () => {
    expect(searchApiFilters({ duration: "short" }, now)).toMatchObject({
      durationMin: undefined,
      durationMax: 239,
    });
    expect(searchApiFilters({ duration: "medium" }, now)).toMatchObject({
      durationMin: 240,
      durationMax: 600,
    });
    expect(searchApiFilters({ duration: "long" }, now)).toMatchObject({
      durationMin: 601,
      durationMax: undefined,
    });
  });

  it("expands a recency bucket against the clock, not against a baked timestamp", () => {
    expect(searchApiFilters({ published: "today" }, now).publishedAfter).toBe(
      "2026-08-24T12:00:00.000Z",
    );
    expect(searchApiFilters({ published: "365d" }, now).publishedAfter).toBe(
      "2025-08-25T12:00:00.000Z",
    );
    expect(searchApiFilters({}, now).publishedAfter).toBeUndefined();
  });

  it("sends no sort for relevance, so a plain search is the request it always was", () => {
    expect(searchApiFilters({ sort: "relevance" }, now).sort).toBeUndefined();
    expect(searchApiFilters({}, now).sort).toBeUndefined();
    expect(searchApiFilters({ sort: "-published_at" }, now).sort).toBe("-published_at");
  });

  it("joins the tag lists into the comma form the endpoint documents", () => {
    expect(searchApiFilters({ tagsAll: ["a", "b"], tagsOne: ["c"] }, now)).toMatchObject({
      tagsAllOf: "a,b",
      tagsOneOf: "c",
    });
    expect(searchApiFilters({ tagsAll: [] }, now).tagsAllOf).toBeUndefined();
  });
});
