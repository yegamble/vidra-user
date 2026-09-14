import { describe, expect, it } from "vitest";

import {
  NEUTRAL_BRAND_FALLBACK,
  NEUTRAL_DESCRIPTION,
  NEUTRAL_PLATFORM_LABEL,
  NEUTRAL_SITE_TITLE,
  SOFTWARE_NAME,
  brandName,
  hideSoftwareName,
  platformLabel,
} from "@/lib/software-brand";

describe("hideSoftwareName", () => {
  it("shows the software name when the snapshot is null (backend unreachable)", () => {
    // Load-bearing default: the mocked Playwright suite renders with no backend
    // at all, so a null snapshot must behave exactly like today.
    expect(hideSoftwareName(null)).toBe(false);
    expect(hideSoftwareName(undefined)).toBe(false);
  });

  it("shows the software name when the branding block or the flag is absent", () => {
    expect(hideSoftwareName({})).toBe(false);
    expect(hideSoftwareName({ branding: {} })).toBe(false);
  });

  it("hides only on an explicit true", () => {
    expect(hideSoftwareName({ branding: { hide_software_name: true } })).toBe(true);
    expect(hideSoftwareName({ branding: { hide_software_name: false } })).toBe(false);
  });
});

describe("platformLabel", () => {
  it("names the software in prose, or stays neutral when hidden", () => {
    expect(platformLabel(false)).toBe(SOFTWARE_NAME);
    expect(platformLabel(true)).toBe(NEUTRAL_PLATFORM_LABEL);
    expect(NEUTRAL_PLATFORM_LABEL).not.toContain(SOFTWARE_NAME);
  });
});

describe("brandName", () => {
  it("prefers the instance's own name in both states", () => {
    expect(brandName("A17 Lab Tube", false)).toBe("A17 Lab Tube");
    expect(brandName("  A17 Lab Tube  ", true)).toBe("A17 Lab Tube");
  });

  it("falls back to the software name only while not hidden", () => {
    expect(brandName("", false)).toBe(SOFTWARE_NAME);
    expect(brandName(null, false)).toBe(SOFTWARE_NAME);
    expect(brandName(undefined, false)).toBe(SOFTWARE_NAME);
  });

  it("has NO fallback when hidden — the caller picks a neutral slot filler", () => {
    expect(brandName("", true)).toBeNull();
    expect(brandName("   ", true)).toBeNull();
    expect(brandName(null, true)).toBeNull();
  });
});

describe("the neutral slot fillers never leak the software name", () => {
  it("keeps every neutral constant free of the product name", () => {
    for (const filler of [
      NEUTRAL_BRAND_FALLBACK,
      NEUTRAL_SITE_TITLE,
      NEUTRAL_DESCRIPTION,
      NEUTRAL_PLATFORM_LABEL,
    ]) {
      expect(filler).not.toMatch(/vidra/i);
      expect(filler.trim()).not.toBe("");
    }
  });
});
