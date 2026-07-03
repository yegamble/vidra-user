import { describe, expect, it } from "vitest";

import { readSearchFilters, searchHref } from "./search-url";

describe("searchHref", () => {
  it("keeps the query first and appends active filters", () => {
    expect(searchHref("go")).toBe("/search?q=go");
    expect(searchHref("go", { category: "7" })).toBe("/search?q=go&category=7");
    expect(searchHref("go", { category: "7", language: "en", tag: "cats" })).toBe(
      "/search?q=go&category=7&language=en&tag=cats",
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
});

describe("readSearchFilters", () => {
  it("extracts filters and normalizes empty strings to undefined", () => {
    expect(readSearchFilters({ category: "7", language: "en", tag: "cats" })).toEqual({
      category: "7",
      language: "en",
      tag: "cats",
    });
    expect(readSearchFilters({ category: "  ", language: "", tag: undefined })).toEqual({
      category: undefined,
      language: undefined,
      tag: undefined,
    });
  });
});
