import { describe, expect, it } from "vitest";

import {
  BRANDING_IMAGE_MAX_BYTES,
  brandingAssetUrl,
  twitterSiteHandle,
  validateBrandingImage,
} from "./branding";

// apiBaseUrl in tests is the default http://localhost:8080 (lib/config).

describe("brandingAssetUrl", () => {
  it("is null for an absent slot", () => {
    expect(brandingAssetUrl(undefined)).toBeNull();
    expect(brandingAssetUrl(null)).toBeNull();
  });

  it("is null while the slot reports is_fallback (client keeps built-in imagery)", () => {
    expect(brandingAssetUrl({ url: "", is_fallback: true })).toBeNull();
    // Defensive: a fallback flag wins even if a URL tags along.
    expect(brandingAssetUrl({ url: "/api/v1/instance/avatar", is_fallback: true })).toBeNull();
  });

  it("is null for a set-but-empty url", () => {
    expect(brandingAssetUrl({ url: "", is_fallback: false })).toBeNull();
  });

  it("resolves the API-relative payload path against apiBaseUrl", () => {
    expect(brandingAssetUrl({ url: "/api/v1/instance/banner", is_fallback: false })).toBe(
      "http://localhost:8080/api/v1/instance/banner",
    );
  });

  it("keeps an already-absolute url untouched", () => {
    expect(brandingAssetUrl({ url: "https://cdn.example/logo.png", is_fallback: false })).toBe(
      "https://cdn.example/logo.png",
    );
  });
});

describe("twitterSiteHandle", () => {
  it("is null when unset or blank", () => {
    expect(twitterSiteHandle(undefined)).toBeNull();
    expect(twitterSiteHandle("")).toBeNull();
    expect(twitterSiteHandle("   ")).toBeNull();
  });

  it("normalizes a bare username to @handle and keeps an existing @", () => {
    expect(twitterSiteHandle("vidra")).toBe("@vidra");
    expect(twitterSiteHandle("@vidra")).toBe("@vidra");
  });
});

describe("validateBrandingImage", () => {
  it("accepts the backend's extension set", () => {
    for (const name of ["a.jpg", "b.JPEG", "c.png", "d.webp"]) {
      expect(validateBrandingImage({ name, size: 1024 })).toBeNull();
    }
  });

  it("rejects other types with the 415-mirroring message", () => {
    expect(validateBrandingImage({ name: "anim.gif", size: 1024 })).toMatch(/JPEG, PNG, or WebP/);
    expect(validateBrandingImage({ name: "vec.svg", size: 1024 })).toMatch(/JPEG, PNG, or WebP/);
  });

  it("rejects a file over the mirrored HTTP body limit", () => {
    expect(
      validateBrandingImage({ name: "big.png", size: BRANDING_IMAGE_MAX_BYTES + 1 }),
    ).toMatch(/8 MiB/);
    expect(validateBrandingImage({ name: "ok.png", size: BRANDING_IMAGE_MAX_BYTES })).toBeNull();
  });
});
