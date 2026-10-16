import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import type { OIDCProvider } from "@/lib/api";
import { createTranslator } from "@/lib/i18n";

import {
  EMPTY_DRAFT,
  createBody,
  draftFromProvider,
  fieldErrors,
  providerErrorMessage,
  splitList,
  updateBody,
} from "./oidc-providers";

const t = createTranslator("en");
const provider: OIDCProvider = {
  name: "corp",
  display_name: "Corp",
  issuer_url: "https://idp.example.com",
  client_id: "cid",
  scopes: ["openid", "email"],
  enabled: true,
  auto_provision: false,
  allowed_email_domains: ["example.com"],
  secret_configured: true,
  secret_status: "ok",
  updated_at: "2026-10-01T00:00:00Z",
};

describe("splitList", () => {
  it("splits on commas and whitespace, drops empties and duplicates", () => {
    expect(splitList(" a, b  c,,a\nd ")).toEqual(["a", "b", "c", "d"]);
    expect(splitList("")).toEqual([]);
  });
});

describe("request bodies", () => {
  it("an edit with an untouched secret omits client_secret and the issuer", () => {
    const body = updateBody(draftFromProvider(provider), "pw");
    expect("client_secret" in body).toBe(false);
    expect("issuer_url" in body).toBe(false);
    expect(body.current_password).toBe("pw");
    expect(body.scopes).toEqual(["openid", "email"]);
  });

  it("an empty replacement secret is still omitted, a typed one is sent", () => {
    const d = draftFromProvider(provider);
    expect("client_secret" in updateBody({ ...d, client_secret: "" }, "pw")).toBe(false);
    expect(updateBody({ ...d, client_secret: "s3" }, "pw").client_secret).toBe("s3");
  });

  it("create carries name, issuer and the secret", () => {
    const body = createBody(
      { ...EMPTY_DRAFT, name: " corp ", issuer_url: "https://i", client_id: "c", client_secret: "s" },
      "pw",
    );
    expect(body).toMatchObject({ name: "corp", issuer_url: "https://i", client_secret: "s" });
  });
});

describe("errors", () => {
  const err = (status: number, code: string, message = "m", fields?: { field: string; message: string }[]) =>
    new ApiError({ status, code, message, fields });

  it("binds 422 fields", () => {
    expect(fieldErrors(err(422, "validation_failed", "x", [{ field: "issuer_url", message: "bad" }]))).toEqual({
      issuer_url: "bad",
    });
  });

  it("maps credential, key and limiter refusals to fixed copy", () => {
    expect(providerErrorMessage(err(403, "step_up_required"), t, "f")).toBe(t("admin.oidc.error.stepUp"));
    expect(providerErrorMessage(err(403, "forbidden"), t, "f")).toBe(t("admin.oidc.error.password"));
    expect(providerErrorMessage(err(429, "rate_limited"), t, "f")).toBe(t("admin.oidc.error.rate"));
    expect(providerErrorMessage(err(409, "oidc_secrets_key_missing"), t, "f")).toBe(
      t("admin.oidc.error.noKey"),
    );
  });

  it("passes a 422 message through", () => {
    expect(providerErrorMessage(err(422, "validation_failed", "disable or edit it instead"), t, "f")).toBe(
      "disable or edit it instead",
    );
  });

  it("preserves a duplicate provider-name conflict instead of asking for a password", () => {
    const message = "an OIDC provider with this name already exists";
    expect(providerErrorMessage(err(409, "conflict", message), t, "f")).toBe(message);
  });

  it("preserves the server's concrete remedy for other conflicts", () => {
    const message = "your account has no password to confirm this with: complete a step-up with your sign-in provider and send step_up_token";
    expect(providerErrorMessage(err(409, "conflict", message), t, "f")).toBe(message);
  });
});
