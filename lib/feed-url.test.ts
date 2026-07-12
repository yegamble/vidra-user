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
    // An explicit local pick matches the shipped default → stays pretty.
    expect(feedHref("recent", { scope: "local" })).toBe("/");
  });

  it("builds URLs against the instance defaults (W5): matching picks stay bare, differing picks stay explicit", () => {
    const defaults = { sort: "popular", scope: "all" } as const;
    // The operator-default sort is the bare home URL; others pin themselves.
    expect(feedHref("popular", {}, defaults)).toBe("/");
    expect(feedHref("recent", {}, defaults)).toBe("/?sort=recent");
    expect(feedHref("trending", {}, defaults)).toBe("/trending");
    // Scope: "all" now matches the default (omitted), "local" must survive.
    expect(feedHref("popular", { scope: "all" }, defaults)).toBe("/");
    expect(feedHref("popular", { scope: "local" }, defaults)).toBe("/?scope=local");
    expect(feedHref("recent", { scope: "local", tag: "cats" }, defaults)).toBe(
      "/?sort=recent&scope=local&tag=cats",
    );
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

  it("normalizes scope: both explicit values are kept (an explicit ?scope=local must beat an instance default of all), unknowns fall back", () => {
    expect(readFeedFilters({ scope: "all" }).scope).toBe("all");
    expect(readFeedFilters({ scope: "local" }).scope).toBe("local");
    expect(readFeedFilters({ scope: "bogus" }).scope).toBeUndefined();
    expect(readFeedFilters({}).scope).toBeUndefined();
  });
});
