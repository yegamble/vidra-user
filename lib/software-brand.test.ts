import { describe, expect, it } from "vitest";

import {
  NEUTRAL_BRAND_FALLBACK,
  NEUTRAL_DESCRIPTION,
  NEUTRAL_PLATFORM_LABEL,
  NEUTRAL_PLATFORM_LABEL_MIDSENTENCE,
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

  // The neutral label is a common noun phrase, so unlike a proper noun its case
  // depends on where it lands. Substituted mid-sentence without this, it rendered
  // "…networks that This platform can post to on your behalf".
  it("lowercases the neutral label mid-sentence", () => {
    expect(platformLabel(true, { sentenceStart: false })).toBe("this platform");
    expect(platformLabel(true, { sentenceStart: true })).toBe(NEUTRAL_PLATFORM_LABEL);
    expect(platformLabel(true)).toBe(NEUTRAL_PLATFORM_LABEL);
  });

  it("leaves the software name alone in BOTH positions — a proper noun never lowercases", () => {
    expect(platformLabel(false, { sentenceStart: false })).toBe(SOFTWARE_NAME);
    expect(platformLabel(false, { sentenceStart: true })).toBe(SOFTWARE_NAME);
  });

  it("differs from the sentence-start form only in the first character", () => {
    const start = platformLabel(true);
    const mid = platformLabel(true, { sentenceStart: false });
    expect(mid).toBe(start[0].toLowerCase() + start.slice(1));
    expect(mid).not.toBe(start);
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
      NEUTRAL_PLATFORM_LABEL_MIDSENTENCE,
    ]) {
      expect(filler).not.toMatch(/vidra/i);
      expect(filler.trim()).not.toBe("");
    }
  });
});
