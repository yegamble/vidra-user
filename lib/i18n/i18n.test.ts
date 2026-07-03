import { describe, expect, it } from "vitest";

import { t } from "./index";

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
