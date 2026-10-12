import { describe, expect, it } from "vitest";

import { createTranslator, t } from "./index";

describe("t", () => {
  it("returns the catalog string for a known key", () => {
    expect(t("common.close")).toBe("Close");
    expect(t("report.submit")).toBe("Submit report");
  });

  it("interpolates {placeholder} vars", () => {
    expect(t("report.title", { noun: "video" })).toBe("Report this video");
    expect(t("report.title", { noun: "comment" })).toBe("Report this comment");
  });

  it("leaves an unfilled placeholder as its literal token", () => {
    // No vars supplied → template returned verbatim.
    expect(t("report.title")).toBe("Report this {noun}");
    // Wrong var name → the {noun} token survives rather than throwing.
    expect(t("report.title", { other: "x" })).toBe("Report this {noun}");
  });

  it("coerces numeric vars to strings", () => {
    // (uses report.title as a generic interpolation carrier)
    expect(t("report.title", { noun: 42 })).toBe("Report this 42");
  });
});

describe("createTranslator", () => {
  it("reads the locale's own catalog first", () => {
    const fr = createTranslator("fr", { "common.close": "Fermer" });
    expect(fr("common.close")).toBe("Fermer");
  });

  it("falls back to en — never to the raw key — when the locale lacks a key", () => {
    const fr = createTranslator("fr", {});
    expect(fr("common.cancel")).toBe("Cancel");
    expect(fr("report.title", { noun: "vidéo" })).toBe("Report this vidéo");
  });

  it("selects a plural form with the locale's Intl.PluralRules", () => {
    const en = createTranslator("en");
    expect(en("search.suggestions", { count: 1 })).toBe("1 suggestion available");
    expect(en("search.suggestions", { count: 0 })).toBe("0 suggestions available");
    expect(en("search.suggestions", { count: 3 })).toBe("3 suggestions available");

    // French puts 0 in the "one" category; English does not.
    const fr = createTranslator("fr", {
      "search.suggestions": { one: "{count} suggestion", other: "{count} suggestions" },
    });
    expect(fr("search.suggestions", { count: 0 })).toBe("0 suggestion");
    expect(fr("search.suggestions", { count: 2 })).toBe("2 suggestions");
  });

  it("uses en's plural rules when it falls back to en's plural forms", () => {
    // fr rules would file 0 under "one" and render "0 suggestion available".
    expect(createTranslator("fr", {})("search.suggestions", { count: 0 })).toBe(
      "0 suggestions available",
    );
  });

  it("formats numeric vars with the locale's number format", () => {
    expect(createTranslator("en")("search.suggestions", { count: 1234 })).toBe(
      "1,234 suggestions available",
    );
    const fr = createTranslator("fr", {
      "search.suggestions": { one: "{count} suggestion", other: "{count} suggestions" },
    });
    // fr groups with a narrow no-break space.
    expect(fr("search.suggestions", { count: 1234 })).toBe("1 234 suggestions");
  });
});
