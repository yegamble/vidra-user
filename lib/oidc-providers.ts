import { ApiError } from "@/lib/api";
import type {
  OIDCProvider,
  OIDCProviderCreateRequest,
  OIDCProviderUpdateRequest,
} from "@/lib/api";
import type { Translate } from "@/lib/i18n";

// Pure helpers for the admin "Sign-in providers" page (no React): how a form
// draft becomes a request body, and how a refused request reads.

/** Split a spaces/commas/newlines list into trimmed, non-empty, de-duplicated items. */
export function splitList(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,]+/)) {
    if (part !== "") seen.add(part);
  }
  return [...seen];
}

export type ProviderDraft = {
  name: string;
  display_name: string;
  issuer_url: string;
  client_id: string;
  /** undefined = untouched. The stored secret is write-only, so it is OMITTED, never "". */
  client_secret: string | undefined;
  scopes: string;
  allowed_email_domains: string;
  auto_provision: boolean;
  enabled: boolean;
};

export function draftFromProvider(p: OIDCProvider): ProviderDraft {
  return {
    name: p.name,
    display_name: p.display_name,
    issuer_url: p.issuer_url,
    client_id: p.client_id,
    client_secret: undefined,
    scopes: p.scopes.join(" "),
    allowed_email_domains: p.allowed_email_domains.join(" "),
    auto_provision: p.auto_provision,
    enabled: p.enabled,
  };
}

export const EMPTY_DRAFT: ProviderDraft = {
  name: "",
  display_name: "",
  issuer_url: "",
  client_id: "",
  client_secret: undefined,
  scopes: "",
  allowed_email_domains: "",
  auto_provision: true,
  enabled: true,
};

/**
 * The PUT body. The issuer is never sent (it cannot change) and an empty
 * secret is never sent (omitting it is what keeps the stored one).
 */
export function updateBody(draft: ProviderDraft, password: string): OIDCProviderUpdateRequest {
  const body: OIDCProviderUpdateRequest = {
    display_name: draft.display_name.trim(),
    client_id: draft.client_id.trim(),
    scopes: splitList(draft.scopes),
    allowed_email_domains: splitList(draft.allowed_email_domains),
    auto_provision: draft.auto_provision,
    enabled: draft.enabled,
    current_password: password,
  };
  if (draft.client_secret) body.client_secret = draft.client_secret;
  return body;
}

export function createBody(draft: ProviderDraft, password: string): OIDCProviderCreateRequest {
  return {
    ...updateBody(draft, password),
    name: draft.name.trim(),
    issuer_url: draft.issuer_url.trim(),
    client_secret: draft.client_secret ?? "",
  };
}

/** Server validation messages keyed by field name (`issuer_url`, `name`, …). */
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof ApiError) {
    for (const f of err.fields ?? []) if (!(f.field in out)) out[f.field] = f.message;
  }
  return out;
}

/**
 * What a refused write says. Credential and limiter refusals get fixed copy
 * (the server's text is not worded for this form); a 422 passes the server's
 * own message through, because that IS the explanation ("a name matching an
 * environment provider must use the env issuer", "disable or edit it instead").
 */
export function providerErrorMessage(err: unknown, t: Translate, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.status === 403 && err.code === "step_up_required") return t("admin.oidc.error.stepUp");
  if (err.status === 403 && err.code === "forbidden") return t("admin.oidc.error.password");
  // A generic 409 can mean a duplicate provider name or a missing password.
  // Preserve the server's concrete explanation rather than guessing a remedy.
  if (err.status === 409 && err.code === "oidc_secrets_key_missing") {
    return t("admin.oidc.error.noKey");
  }
  if (err.status === 429) return t("admin.oidc.error.rate");
  if (err.status === 422) {
    const first = err.fields?.[0]?.message;
    if (first && !err.message.includes(first)) return `${err.message} ${first}`.trim();
    return err.message || fallback;
  }
  return err.message || fallback;
}
