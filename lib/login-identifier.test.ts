import { describe, expect, it } from "vitest";

import { loginCredentials, looksLikeEmail } from "./login-identifier";

// looksLikeEmail must stay byte-for-byte equivalent to vidra-core's
// internal/httpapi/auth.go rule: the two decide which request shape an input
// produces, and a disagreement would send username-shaped values down the
// email path (or vice versa) and 422 real users out of their accounts.
describe("looksLikeEmail", () => {
  it("accepts a single @ with a non-empty local part and a dotted domain", () => {
    for (const s of ["ada@example.test", "a@b.c", "  ada@example.test  ", "a+tag@sub.example.co"]) {
      expect(looksLikeEmail(s), s).toBe(true);
    }
  });

  it("rejects anything else — these are usernames", () => {
    for (const s of [
      "",
      "ada",
      "@example.test", // empty local part
      "ada@", // empty domain
      "ada@example", // no dot in the domain
      "a@b@c.test", // two @
      "ada smith",
    ]) {
      expect(looksLikeEmail(s), s).toBe(false);
    }
  });
});

describe("loginCredentials", () => {
  it("sends email-shaped input as the legacy `email` field", () => {
    // This is the back-compat lever: it keeps sign-in working when the
    // frontend deploys ahead of the backend that understands `identifier`.
    expect(loginCredentials("ada@example.test", "pw")).toEqual({
      email: "ada@example.test",
      password: "pw",
    });
  });

  it("sends anything else as `identifier`", () => {
    expect(loginCredentials("ada", "pw")).toEqual({ identifier: "ada", password: "pw" });
  });

  it("never emits both identifier fields", () => {
    for (const input of ["ada@example.test", "ada", "a@b@c"]) {
      const body = loginCredentials(input, "pw") as Record<string, unknown>;
      expect(Object.keys(body).sort(), input).not.toContain(
        "email" in body ? "identifier" : "email",
      );
    }
  });

  it("does not trim the value it sends", () => {
    // The server trims. Trimming here would silently "fix" a bad paste the
    // user should be able to see in the field.
    expect(loginCredentials("  ada  ", "pw")).toEqual({ identifier: "  ada  ", password: "pw" });
  });
});
