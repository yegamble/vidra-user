import { describe, expect, it } from "vitest";

import { isStandaloneRoute } from "@/lib/app-shell";

describe("isStandaloneRoute", () => {
  it.each([
    "/embed/video-1",
    "/login",
    "/signup",
    "/reset-password",
    "/reset-password/confirm",
    "/verify-email/confirm",
  ])("hides browsing chrome on %s", (pathname) => {
    expect(isStandaloneRoute(pathname)).toBe(true);
  });

  it.each([null, "/", "/search", "/settings", "/verify-email", "/embedded"])(
    "keeps browsing chrome on %s",
    (pathname) => {
      expect(isStandaloneRoute(pathname)).toBe(false);
    },
  );
});
