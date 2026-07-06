"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { InstanceSetting, InstanceSettingsResponse } from "@/lib/api";

type Status = "loading" | "error" | "ready";

type GroupId = "identity" | "registration" | "features" | "moderation" | "other";

const GROUPS: { id: GroupId; title: string; description: string }[] = [
  {
    id: "identity",
    title: "Instance identity",
    description: "Public name, description, and legal/contact links shown across the instance.",
  },
  {
    id: "registration",
    title: "Registration",
    description: "Whether people can sign up, and whether new signups need admin approval.",
  },
  {
    id: "features",
    title: "Features",
    description: "Turn instance capabilities on or off. A disabled feature is refused server-side.",
  },
  {
    id: "moderation",
    title: "Moderation",
    description: "Safety gates applied to new content.",
  },
  { id: "other", title: "Other settings", description: "Additional runtime settings." },
];

// Per-key presentation metadata. Any key the backend returns that is not listed
// here still renders (in the "Other" group) so a new setting is never hidden.
const META: Record<string, { label: string; help?: string; group: GroupId; placeholder?: string }> = {
  instance_name: { label: "Instance name", group: "identity", placeholder: "Vidra" },
  instance_description: {
    label: "Description",
    group: "identity",
    placeholder: "A short description of this instance",
  },
  terms_url: { label: "Terms of service URL", group: "identity", placeholder: "https://…" },
  privacy_url: { label: "Privacy policy URL", group: "identity", placeholder: "https://…" },
  contact_email: { label: "Contact email", group: "identity", placeholder: "admin@example.org" },
  registration_enabled: {
    label: "Allow new registrations",
    help: "When off, the signup page is closed.",
    group: "registration",
  },
  registration_require_approval: {
    label: "Require approval for new accounts",
    help: "New signups file a pending request an admin must approve.",
    group: "registration",
  },
  uploads_enabled: {
    label: "Video uploads",
    help: "Allow creators to upload video files.",
    group: "features",
  },
  imports_enabled: {
    label: "URL imports",
    help: "Allow creators to import a video from a URL.",
    group: "features",
  },
  live_enabled: { label: "Live streaming", help: "Allow creators to run live streams.", group: "features" },
  comments_enabled: { label: "Comments", help: "Allow viewers to comment on videos.", group: "features" },
  quarantine_new_uploads: {
    label: "Quarantine new uploads",
    help: "Hold new uploads for moderator review before they publish.",
    group: "moderation",
  },
};

function groupOf(key: string): GroupId {
  return META[key]?.group ?? "other";
}

// AdminInstanceConfigView is the admin-only instance configuration page. It loads
// the effective settings overlay (GET /admin/instance-settings), renders grouped
// text/toggle controls, and persists a partial update (PATCH) on save, showing
// which values are overridden by the database vs left at their config default.
// Role-gated by RoleGate.
export function AdminInstanceConfigView() {
  return (
    <RoleGate minRole="admin" action="configure the instance">
      <ConfigForm />
    </RoleGate>
  );
}

function ConfigForm() {
  const [status, setStatus] = useState<Status>("loading");
  const [settings, setSettings] = useState<InstanceSetting[]>([]);
  // The editable working copy, keyed by setting key. Reseeded from the server
  // truth on every successful load/save (so the UI reflects effective values).
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // The key currently having its override cleared (per-row spinner/disable).
  const [resetting, setResetting] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const seed = useCallback((list: InstanceSetting[]) => {
    setSettings(list);
    const next: Record<string, string | boolean> = {};
    for (const s of list) next[s.key] = s.value;
    setDraft(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstanceSettings(controller.signal)
      .then((res) => {
        seed(res.settings);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey, seed]);

  // The set of keys whose draft value differs from the effective server value.
  const changedKeys = useMemo(
    () => settings.filter((s) => draft[s.key] !== s.value).map((s) => s.key),
    [settings, draft],
  );
  const dirty = changedKeys.length > 0;

  const setValue = useCallback((key: string, value: string | boolean) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const applyResult = useCallback(
    (res: InstanceSettingsResponse) => {
      seed(res.settings);
      setFieldErrors({});
      setSaveError(null);
    },
    [seed],
  );

  const onError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 422 && err.fields && err.fields.length > 0) {
      const map: Record<string, string> = {};
      for (const f of err.fields) map[f.field] = f.message;
      setFieldErrors(map);
      setSaveError("Some values were rejected — see the highlighted fields.");
      return;
    }
    setSaveError(errorMessage(err, "Could not save the settings."));
  }, []);

  const save = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    setFieldErrors({});
    const patch: Record<string, string | boolean> = {};
    for (const key of changedKeys) patch[key] = draft[key];
    try {
      const res = await api.updateInstanceSettings(patch);
      applyResult(res);
      setSaved(true);
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, changedKeys, draft, applyResult, onError]);

  // Clear a key's database override, resetting it to the config default. Sends an
  // immediate PATCH { key: null } and reseeds from the returned effective doc.
  const resetToDefault = useCallback(
    async (key: string) => {
      setResetting(key);
      setSaved(false);
      setSaveError(null);
      try {
        const res = await api.updateInstanceSettings({ [key]: null });
        applyResult(res);
      } catch (err) {
        onError(err);
      } finally {
        setResetting(null);
      }
    },
    [applyResult, onError],
  );

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading instance settings" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Could not load the instance settings."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  const byKey = new Map(settings.map((s) => [s.key, s]));

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {GROUPS.map((group) => {
        const keys = settings.filter((s) => groupOf(s.key) === group.id).map((s) => s.key);
        if (keys.length === 0) return null;
        return (
          <section key={group.id} aria-label={group.title} className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-fg">{group.title}</h2>
              <p className="text-sm text-fg-muted">{group.description}</p>
            </div>
            <Card className="flex flex-col divide-y divide-border-subtle">
              {keys.map((key) => {
                const setting = byKey.get(key);
                if (!setting) return null;
                return (
                  <SettingRow
                    key={key}
                    setting={setting}
                    draftValue={draft[key]}
                    error={fieldErrors[key]}
                    resetting={resetting === key}
                    disabled={saving}
                    onChange={(v) => setValue(key, v)}
                    onReset={() => void resetToDefault(key)}
                  />
                );
              })}
            </Card>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {dirty ? (
          <span className="text-sm text-fg-muted">
            {changedKeys.length} unsaved {changedKeys.length === 1 ? "change" : "changes"}
          </span>
        ) : saved ? (
          <span role="status" className="text-sm text-success">
            Settings saved.
          </span>
        ) : null}
        {saveError ? (
          <span role="alert" className="text-sm text-danger">
            {saveError}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function SettingRow({
  setting,
  draftValue,
  error,
  resetting,
  disabled,
  onChange,
  onReset,
}: {
  setting: InstanceSetting;
  draftValue: string | boolean;
  error?: string;
  resetting: boolean;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
  onReset: () => void;
}) {
  const meta = META[setting.key];
  const label = meta?.label ?? setting.key;
  const isBool = setting.type === "bool";

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="block text-sm font-medium text-fg">{label}</span>
          {meta?.help ? <span className="block text-xs text-fg-muted">{meta.help}</span> : null}
          <div className="mt-1 flex items-center gap-2">
            {setting.overridden ? (
              <>
                <Badge variant="accent">Overridden</Badge>
                <button
                  type="button"
                  onClick={onReset}
                  disabled={resetting || disabled}
                  className="focus-ring rounded text-xs text-fg-muted underline underline-offset-2 hover:text-fg disabled:opacity-60"
                >
                  {resetting ? "Resetting…" : "Reset to default"}
                </button>
              </>
            ) : (
              <Badge variant="neutral">Default</Badge>
            )}
          </div>
        </div>
        {isBool ? (
          <Toggle
            checked={draftValue === true}
            onChange={(next) => onChange(next)}
            label={label}
            disabled={disabled || resetting}
          />
        ) : null}
      </div>

      {!isBool ? (
        <Input
          aria-label={label}
          value={typeof draftValue === "string" ? draftValue : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={meta?.placeholder}
          error={error}
          disabled={disabled || resetting}
        />
      ) : error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
