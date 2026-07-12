import { describe, expect, it } from "vitest";

import {
  accentForegroundFor,
  buildAccentOverrideCss,
  contrastRatio,
  isHexColor,
  primaryColorContrast,
  relativeLuminance,
} from "./contrast";

describe("contrast math", () => {
  it("computes the canonical extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 2); // symmetric
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("matches the known AA-threshold gray (#767676 on white ≈ 4.54:1)", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThan(4.5);
    expect(contrastRatio("#767676", "#ffffff")).toBeLessThan(4.6);
  });

  it("relative luminance is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("isHexColor", () => {
  it("accepts strict #rrggbb only", () => {
    expect(isHexColor("#0f62fe")).toBe(true);
    expect(isHexColor("#0F62FE")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("0f62fe")).toBe(false);
    expect(isHexColor("#0f62fe00")).toBe(false);
    expect(isHexColor("")).toBe(false);
    expect(isHexColor("#00};body{display:none")).toBe(false);
  });
});

describe("primaryColorContrast", () => {
  it("returns null for non-colors and the empty (unset) value", () => {
    expect(primaryColorContrast("")).toBeNull();
    expect(primaryColorContrast("blue")).toBeNull();
    expect(primaryColorContrast("#fff")).toBeNull();
  });

  it("known-good for LIGHT: a deep blue passes light, warns dark", () => {
    const report = primaryColorContrast("#1d4ed8");
    expect(report).not.toBeNull();
    expect(report!.light).toBeGreaterThan(4.5);
    expect(report!.dark).toBeLessThan(4.5);
    expect(report!.warnings).toHaveLength(1);
    expect(report!.warnings[0]).toMatch(/dark theme/);
  });

  it("known-good for DARK: a bright amber passes dark, warns light", () => {
    const report = primaryColorContrast("#fbbf24");
    expect(report).not.toBeNull();
    expect(report!.dark).toBeGreaterThan(4.5);
    expect(report!.light).toBeLessThan(4.5);
    expect(report!.warnings).toHaveLength(1);
    expect(report!.warnings[0]).toMatch(/light theme/);
  });

  it("known-bad for BOTH: a mid violet warns for light and dark", () => {
    // L ≈ 0.19 sits in the dead zone: < 4.5:1 against #ffffff AND #0a0a0a.
    const report = primaryColorContrast("#7c5cff");
    expect(report).not.toBeNull();
    expect(report!.light).toBeLessThan(4.5);
    expect(report!.warnings.length).toBeGreaterThanOrEqual(1);
    expect(report!.warnings.join(" ")).toMatch(/light theme/);
  });
});

describe("accentForegroundFor", () => {
  it("puts white text on a dark accent", () => {
    expect(accentForegroundFor("#1d4ed8")).toBe("#ffffff");
    expect(accentForegroundFor("#18181b")).toBe("#ffffff");
  });

  it("puts the near-black ink on a bright accent", () => {
    expect(accentForegroundFor("#fbbf24")).toBe("#18181b");
    expect(accentForegroundFor("#f4f4f5")).toBe("#18181b");
  });
});

describe("buildAccentOverrideCss", () => {
  it("overrides the token pair for a valid color", () => {
    expect(buildAccentOverrideCss("#1D4ED8")).toBe(
      ":root{--accent:#1d4ed8;--accent-fg:#ffffff;}",
    );
    expect(buildAccentOverrideCss("#fbbf24")).toBe(
      ":root{--accent:#fbbf24;--accent-fg:#18181b;}",
    );
  });

  it("refuses anything that is not a strict hex color (CSS injection guard)", () => {
    expect(buildAccentOverrideCss("")).toBeNull();
    expect(buildAccentOverrideCss("#fff")).toBeNull();
    expect(buildAccentOverrideCss("red;} body{display:none}")).toBeNull();
  });
});
