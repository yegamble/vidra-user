import { describe, expect, it } from "vitest";

import { VIDEO_PRIVACY_CHOICES, isSignInRequired } from "./video-privacy";

describe("VIDEO_PRIVACY_CHOICES", () => {
  it("offers internal between unlisted and private, labelled for who can see it", () => {
    expect(VIDEO_PRIVACY_CHOICES.map((c) => c.value)).toEqual(["public", "unlisted", "internal", "private"]);
    expect(VIDEO_PRIVACY_CHOICES.find((c) => c.value === "internal")?.label).toBe(
      "Internal (signed-in users only)",
    );
  });

  it("never offers password — it needs a password first, so only the editor adds it", () => {
    expect(VIDEO_PRIVACY_CHOICES.some((c) => c.value === "password")).toBe(false);
  });
});

describe("isSignInRequired", () => {
  it("is the 401 sign_in_required core answers an anonymous read of an internal video", () => {
    expect(isSignInRequired({ status: 401, code: "sign_in_required" })).toBe(true);
  });

  it("is not any other refusal", () => {
    expect(isSignInRequired({ status: 401, code: "password_required" })).toBe(false);
    expect(isSignInRequired({ status: 401, code: "unauthorized" })).toBe(false);
    expect(isSignInRequired({ status: 404, code: "sign_in_required" })).toBe(false);
    expect(isSignInRequired(new Error("network"))).toBe(false);
    expect(isSignInRequired(null)).toBe(false);
  });
});
