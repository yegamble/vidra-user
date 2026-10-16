"use client";

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/components/I18nProvider";
import { RoleGate } from "@/components/RoleGate";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";
import { OIDCConfirmDialog } from "@/components/admin/OIDCConfirmDialog";
import { OIDCProviderDialog } from "@/components/admin/OIDCProviderDialog";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { api } from "@/lib/api";
import type { OIDCProvider, OIDCProviderList } from "@/lib/api";
import { draftFromProvider, providerErrorMessage, updateBody } from "@/lib/oidc-providers";

// The "Sign-in providers" instance-configuration page: admin-managed OIDC
// providers (list, create/edit dialog, enable switch, delete). Bespoke rather
// than registry-driven for the same reason as the email page: a provider is a
// document with a write-only secret and a fresh-credential rule on every write.
export function AdminOIDCProvidersView() {
  return (
    <RoleGate minRole="admin" action="manage sign-in providers">
      <OIDCProvidersPanel />
    </RoleGate>
  );
}

type Dialog =
  | { kind: "edit"; provider: OIDCProvider | null }
  | { kind: "toggle"; provider: OIDCProvider }
  | { kind: "delete"; provider: OIDCProvider };

// Exported for component tests; production enters through the role gate.
export function OIDCProvidersPanel() {
  const t = useT();
  const [data, setData] = useState<OIDCProviderList | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listOIDCProviders(controller.signal)
      .then((list) => {
        setData(list);
        setStatus("idle");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const reload = useCallback(() => {
    setDialog(null);
    setReloadKey((k) => k + 1);
  }, []);

  const rows = data?.providers ?? [];
  const envNames = new Set((data?.environment ?? []).map((e) => e.name));
  const columns: AdminTableColumn<OIDCProvider>[] = [
    {
      key: "provider",
      header: t("admin.oidc.col.provider"),
      cell: (p) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-fg">{p.display_name || p.name}</span>
          <span className="text-xs text-fg-muted">
            {p.name}
            {envNames.has(p.name) ? ` · ${t("admin.oidc.overrides")}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "issuer",
      header: t("admin.oidc.col.issuer"),
      cell: (p) => <span className="break-all text-xs text-fg-muted">{p.issuer_url}</span>,
    },
    {
      key: "secret",
      header: t("admin.oidc.col.secret"),
      cell: (p) =>
        p.secret_status === "undecryptable" ? (
          <Badge variant="danger">{t("admin.oidc.secret.undecryptable")}</Badge>
        ) : p.secret_configured ? (
          <Badge variant="success">{t("admin.oidc.secret.configured")}</Badge>
        ) : (
          <Badge variant="neutral">{t("admin.oidc.secret.missing")}</Badge>
        ),
    },
    {
      key: "enabled",
      header: t("admin.oidc.col.enabled"),
      cell: (p) => (
        <Toggle
          checked={p.enabled}
          label={t("admin.oidc.toggle", { name: p.name })}
          onChange={() => setDialog({ kind: "toggle", provider: p })}
        />
      ),
    },
    {
      key: "actions",
      header: t("admin.oidc.col.actions"),
      srOnlyHeader: true,
      align: "end",
      cell: (p) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            aria-label={t("admin.oidc.edit", { name: p.name })}
            onClick={() => setDialog({ kind: "edit", provider: p })}
          >
            {t("admin.oidc.editButton")}
          </Button>
          <Button
            size="sm"
            variant="danger-outline"
            aria-label={t("admin.oidc.delete", { name: p.name })}
            onClick={() => setDialog({ kind: "delete", provider: p })}
          >
            {t("admin.oidc.deleteButton")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose">
          <h2 className="text-[15px] font-bold tracking-tight">{t("admin.oidc.title")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("admin.oidc.intro")}</p>
        </div>
        <Button onClick={() => setDialog({ kind: "edit", provider: null })} disabled={status === "loading"}>
          {t("admin.oidc.add")}
        </Button>
      </div>
      {data && !data.secrets_available ? <Alert variant="warning">{t("admin.oidc.noKey")}</Alert> : null}
      <AdminTable
        label={t("admin.oidc.table")}
        columns={columns}
        rows={rows}
        rowKey={(p) => p.name}
        status={status}
        errorMessage={t("admin.oidc.loadError")}
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
        empty={<p className="text-sm text-fg-muted">{t("admin.oidc.empty")}</p>}
        minWidth="44rem"
      />
      {data && data.environment.length > 0 ? (
        <section aria-label={t("admin.oidc.env.title")} className="text-sm text-fg-muted">
          <h3 className="font-semibold text-fg">{t("admin.oidc.env.title")}</h3>
          <ul className="mt-1 list-disc pl-5">
            {data.environment.map((e) => (
              <li key={e.name}>
                {t(e.overridden ? "admin.oidc.env.overridden" : "admin.oidc.env.item", {
                  name: e.name,
                  issuer: e.issuer_url,
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dialog?.kind === "edit" ? (
        <OIDCProviderDialog
          provider={dialog.provider}
          secretsAvailable={data?.secrets_available ?? true}
          onClose={() => setDialog(null)}
          onSaved={reload}
        />
      ) : null}
      {dialog?.kind === "toggle" ? (
        <OIDCConfirmDialog
          title={t("admin.oidc.confirm.toggleTitle", { name: dialog.provider.name })}
          body={t(dialog.provider.enabled ? "admin.oidc.confirm.disable" : "admin.oidc.confirm.enable", {
            name: dialog.provider.name,
          })}
          submitLabel={t("admin.oidc.confirm.submitToggle")}
          onClose={() => setDialog(null)}
          run={async (password) => {
            const p = dialog.provider;
            try {
              await api.updateOIDCProvider(
                p.name,
                updateBody({ ...draftFromProvider(p), enabled: !p.enabled }, password),
              );
              reload();
              return null;
            } catch (err) {
              return providerErrorMessage(err, t, t("admin.oidc.error.generic"));
            }
          }}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <OIDCConfirmDialog
          danger
          title={t("admin.oidc.confirm.deleteTitle", { name: dialog.provider.name })}
          body={t("admin.oidc.confirm.deleteBody", { name: dialog.provider.name })}
          submitLabel={t("admin.oidc.confirm.submitDelete")}
          onClose={() => setDialog(null)}
          run={async (password) => {
            try {
              await api.deleteOIDCProvider(dialog.provider.name, { current_password: password });
              reload();
              return null;
            } catch (err) {
              return providerErrorMessage(err, t, t("admin.oidc.error.deleteGeneric"));
            }
          }}
        />
      ) : null}
    </div>
  );
}
