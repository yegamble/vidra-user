import { describe, expect, it } from "vitest";

import { isAdminConsoleRoute, isStandaloneRoute } from "@/lib/app-shell";

describe("isStandaloneRoute", () => {
  it.each([
    "/embed/video-1",
    "/login",
    "/signup",
    "/setup/claim",
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

describe("isAdminConsoleRoute", () => {
  it("is the admin's own /admin/* routes — where the console rail replaces the app sidebar", () => {
    expect(isAdminConsoleRoute("/admin", "admin")).toBe(true);
    expect(isAdminConsoleRoute("/admin/users", "admin")).toBe(true);
  });

  it("is false for anyone who does not get the console (they keep the app sidebar)", () => {
    expect(isAdminConsoleRoute("/admin", "moderator")).toBe(false);
    expect(isAdminConsoleRoute("/admin/users", undefined)).toBe(false);
  });

  it("is false off the admin routes", () => {
    expect(isAdminConsoleRoute("/", "admin")).toBe(false);
    expect(isAdminConsoleRoute(null, "admin")).toBe(false);
  });
});
