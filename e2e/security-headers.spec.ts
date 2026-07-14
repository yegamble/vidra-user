import { expect, test } from "@playwright/test";

test("responses expose the report-only CSP and baseline hardening headers", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const headers = response.headers();

  expect(headers["content-security-policy"]).toBeUndefined();
  expect(headers["content-security-policy-report-only"]).toContain("worker-src 'self' blob:");
  expect(headers["strict-transport-security"]).toContain("max-age=31536000");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();
});
