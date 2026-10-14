"use client";

import { useState, type FormEvent } from "react";

import { useT } from "@/components/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SecretInput } from "@/components/ui/SecretInput";
import { api } from "@/lib/api";
import type { OIDCProvider } from "@/lib/api";
import {
  EMPTY_DRAFT,
  createBody,
  draftFromProvider,
  fieldErrors,
  providerErrorMessage,
  updateBody,
  type ProviderDraft,
} from "@/lib/oidc-providers";

/**
 * Create / edit dialog for one admin-managed OIDC provider. The client secret is
 * write-only (SecretInput: untouched = omitted from the PUT), the issuer of an
 * existing provider is read-only, and every save carries the admin's own
 * password (the fresh-credential rule). A 422 binds its `fields` to the inputs.
 */
export function OIDCProviderDialog({
  provider,
  secretsAvailable,
  onClose,
  onSaved,
}: {
  /** The provider being edited, or null to create one. */
  provider: OIDCProvider | null;
  secretsAvailable: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const editing = provider !== null;
  const [draft, setDraft] = useState<ProviderDraft>(
    provider ? draftFromProvider(provider) : EMPTY_DRAFT,
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function patch(next: Partial<ProviderDraft>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password === "") {
      setError(t("admin.oidc.form.passwordRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setErrors({});
    // The proof must not outlive this attempt in a controlled input.
    const proof = password;
    setPassword("");
    try {
      if (provider) await api.updateOIDCProvider(provider.name, updateBody(draft, proof));
      else await api.createOIDCProvider(createBody(draft, proof));
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(providerErrorMessage(err, t, t("admin.oidc.error.generic")));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? t("admin.oidc.form.editTitle", { name: provider.name }) : t("admin.oidc.form.createTitle")}
      onClose={onClose}
    >
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        {!editing ? (
          <Input
            label={t("admin.oidc.form.name")}
            hint={t("admin.oidc.form.nameHint")}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            error={errors.name}
            autoComplete="off"
            spellCheck={false}
          />
        ) : null}
        <Input
          label={t("admin.oidc.form.displayName")}
          hint={t("admin.oidc.form.displayNameHint")}
          value={draft.display_name}
          onChange={(e) => patch({ display_name: e.target.value })}
          error={errors.display_name}
        />
        <Input
          label={t("admin.oidc.form.issuer")}
          hint={editing ? t("admin.oidc.form.issuerLocked") : undefined}
          value={draft.issuer_url}
          onChange={(e) => patch({ issuer_url: e.target.value })}
          error={errors.issuer_url}
          readOnly={editing}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
        <Input
          label={t("admin.oidc.form.clientId")}
          value={draft.client_id}
          onChange={(e) => patch({ client_id: e.target.value })}
          error={errors.client_id}
          autoComplete="off"
          spellCheck={false}
        />
        <SecretInput
          label={t("admin.oidc.form.clientSecret")}
          hint={t("admin.oidc.form.clientSecretHint")}
          error={errors.client_secret}
          isSet={provider?.secret_configured ?? false}
          value={draft.client_secret}
          onChange={(next) => patch({ client_secret: next })}
          disabled={!secretsAvailable}
          disabledReason={t("admin.oidc.error.noKey")}
        />
        <Input
          label={t("admin.oidc.form.scopes")}
          hint={t("admin.oidc.form.scopesHint")}
          value={draft.scopes}
          onChange={(e) => patch({ scopes: e.target.value })}
          error={errors.scopes}
          autoComplete="off"
          spellCheck={false}
        />
        <Input
          label={t("admin.oidc.form.domains")}
          hint={t("admin.oidc.form.domainsHint")}
          value={draft.allowed_email_domains}
          onChange={(e) => patch({ allowed_email_domains: e.target.value })}
          error={errors.allowed_email_domains}
          autoComplete="off"
          spellCheck={false}
        />
        <Checkbox
          label={t("admin.oidc.form.autoProvision")}
          checked={draft.auto_provision}
          onChange={(e) => patch({ auto_provision: e.target.checked })}
        />
        <Checkbox
          label={t("admin.oidc.form.enabled")}
          checked={draft.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        <Input
          type="password"
          label={t("admin.oidc.form.password")}
          hint={t("admin.oidc.form.passwordHint")}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t("admin.oidc.form.saving") : t("admin.oidc.form.save")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("admin.oidc.form.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
