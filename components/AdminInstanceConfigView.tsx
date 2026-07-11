"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Markdown } from "@/components/Markdown";
import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { ApiError, api, errorMessage, getVideoConfigCached } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type {
  InstanceSetting,
  InstanceSettingsResponse,
  UpdateInstanceSettingsRequest,
  VideoConfigOption,
  VideoConfigResponse,
} from "@/lib/api";
import { COUNTRIES } from "@/lib/countries";

type Status = "loading" | "error" | "ready";

/** A setting's editable value: string, bool, integer (limit kinds), or (list kinds) a string array. */
type SettingValue = string | boolean | string[] | number;

type AdminInstanceSetting = InstanceSetting;

type GroupId =
  | "administrators"
  | "platform"
  | "social"
  | "moderation"
  | "you"
  | "other-info"
  | "registration"
  | "features"
  | "limits"
  | "other";

const GROUPS: { id: GroupId; title: string; description: string }[] = [
  {
    id: "administrators",
    title: "Administrators",
    description: "Who runs this instance and how visitors can reach them.",
  },
  {
    id: "platform",
    title: "Platform",
    description: "The public identity of this instance: name, descriptions, and classification.",
  },
  {
    id: "social",
    title: "Social",
    description: "How people can support and follow the instance elsewhere.",
  },
  {
    id: "moderation",
    title: "Moderation & sensitive content",
    description: "Rules of the house and how sensitive videos are treated.",
  },
  {
    id: "you",
    title: "You and your platform",
    description: "The questions every visitor deserves an answer to, shown on the About page.",
  },
  {
    id: "other-info",
    title: "Other information",
    description: "Technical background about this deployment.",
  },
  {
    id: "registration",
    title: "Registration",
    description: "Whether people can sign up, and whether new signups need admin approval.",
  },
  {
    id: "features",
    title: "Features",
    description:
      "Turning a feature off returns “feature disabled” from its endpoints immediately — no restart needed.",
  },
  {
    id: "limits",
    title: "Limits",
    description:
      "Operational caps enforced on uploads and imports. 0 means unlimited; changes apply on the next request or job — no restart.",
  },
  { id: "other", title: "Other settings", description: "Additional runtime settings." },
];

// How a setting is edited. Drives the control rendered per row; the server's
// `type` stays the validation truth (Phase B), presentation lives here.
type ControlKind =
  | "text"
  | "textarea"
  | "markdown" // Textarea + markdown Preview modal
  | "toggle"
  | "language-select"
  | "country-select"
  | "category-multi"
  | "language-multi"
  | "policy-segmented"
  | "number" // bounded integer input (limit keys)
  | "bytes"; // like number, with a human-readable size hint

// Per-key presentation metadata, in DISPLAY ORDER within each group. Any key
// the backend returns that is not listed here still renders (in the "Other"
// group, by its server type) so a new setting is never hidden. Conversely,
// every key here renders even while the backend does not return it yet — the
// row is simply disabled until the server supports the setting.
const META: Record<
  string,
  { label: string; help?: string; group: GroupId; placeholder?: string; control: ControlKind }
> = {
  // 1. ADMINISTRATORS
  contact_email: {
    label: "Admin email",
    help: "Shown on the About page and used as the contact-form recipient.",
    group: "administrators",
    placeholder: "admin@example.org",
    control: "text",
  },
  contact_form_enabled: {
    label: "Enable contact form",
    help: "Lets visitors write to you from the About page (needs an admin email and mail delivery).",
    group: "administrators",
    control: "toggle",
  },
  // 2. PLATFORM
  instance_name: { label: "Name", group: "platform", placeholder: "Vidra", control: "text" },
  instance_short_description: {
    label: "Short description",
    help: "One or two sentences shown under the name (250 characters max).",
    group: "platform",
    control: "textarea",
  },
  instance_description: {
    label: "Description",
    help: "The long description on the About page. Markdown is supported.",
    group: "platform",
    control: "markdown",
  },
  default_language: {
    label: "Default language",
    help: "The main language of this instance.",
    group: "platform",
    control: "language-select",
  },
  instance_categories: {
    label: "Main instance categories",
    help: "What this instance is mostly about.",
    group: "platform",
    control: "category-multi",
  },
  moderator_languages: {
    label: "Main languages you/your moderators speak",
    group: "platform",
    control: "language-multi",
  },
  server_country: {
    label: "Server country",
    help: "Where this server is hosted.",
    group: "platform",
    control: "country-select",
  },
  terms_url: {
    label: "Terms of service URL",
    group: "platform",
    placeholder: "https://…",
    control: "text",
  },
  privacy_url: {
    label: "Privacy policy URL",
    group: "platform",
    placeholder: "https://…",
    control: "text",
  },
  // 3. SOCIAL
  support_text: {
    label: "Support text",
    help: "How people can support the instance (donations, contributions). Markdown is supported.",
    group: "social",
    control: "markdown",
  },
  website_link: {
    label: "External link",
    group: "social",
    placeholder: "https://…",
    control: "text",
  },
  mastodon_link: {
    label: "Mastodon link",
    group: "social",
    placeholder: "https://…",
    control: "text",
  },
  x_link: { label: "X link", group: "social", placeholder: "https://…", control: "text" },
  bluesky_link: {
    label: "Bluesky link",
    group: "social",
    placeholder: "https://…",
    control: "text",
  },
  // 4. MODERATION & SENSITIVE CONTENT
  instance_is_sensitive: {
    label: "This instance is dedicated to sensitive content",
    group: "moderation",
    control: "toggle",
  },
  sensitive_content_policy: {
    label: "Policy on videos containing sensitive content",
    help: "Hide removes them from public browse and search; Warn and Blur gate playback behind a notice; Display shows them normally.",
    group: "moderation",
    control: "policy-segmented",
  },
  terms: {
    label: "Terms",
    help: "The instance terms, shown on the About page. Markdown is supported.",
    group: "moderation",
    control: "markdown",
  },
  code_of_conduct: {
    label: "Code of conduct",
    group: "moderation",
    control: "markdown",
  },
  moderation_info: {
    label: "Moderation information",
    help: "Who moderates, what gets removed, how reports are handled. Markdown is supported.",
    group: "moderation",
    control: "markdown",
  },
  quarantine_new_uploads: {
    label: "Quarantine new uploads",
    help: "Hold new uploads for moderator review before they publish.",
    group: "moderation",
    control: "toggle",
  },
  // 5. YOU AND YOUR PLATFORM
  administrator_info: {
    label: "Who is behind the instance?",
    group: "you",
    control: "markdown",
  },
  creation_reason: {
    label: "Why did you create this instance?",
    group: "you",
    control: "markdown",
  },
  maintenance_lifetime: {
    label: "How long do you plan to maintain it?",
    group: "you",
    control: "markdown",
  },
  business_model: {
    label: "How will you finance the server?",
    group: "you",
    control: "markdown",
  },
  // 6. OTHER INFORMATION
  hardware_info: {
    label: "What server/hardware does the instance run on?",
    group: "other-info",
    control: "markdown",
  },
  // 7. REGISTRATION
  registration_enabled: {
    label: "Allow new registrations",
    help: "When off, the signup page is closed.",
    group: "registration",
    control: "toggle",
  },
  registration_require_approval: {
    label: "Require approval for new accounts",
    help: "New signups file a pending request an admin must approve.",
    group: "registration",
    control: "toggle",
  },
  // 8. FEATURES
  uploads_enabled: {
    label: "Video uploads",
    help: "Allow creators to upload video files.",
    group: "features",
    control: "toggle",
  },
  imports_enabled: {
    label: "URL imports",
    help: "Allow creators to import a video from a URL.",
    group: "features",
    control: "toggle",
  },
  live_enabled: {
    label: "Live streaming",
    help: "Allow creators to run live streams.",
    group: "features",
    control: "toggle",
  },
  comments_enabled: {
    label: "Comments",
    help: "Allow viewers to comment on videos.",
    group: "features",
    control: "toggle",
  },
  // 9. LIMITS (operational caps; 0 = unlimited / no cap)
  default_user_quota_bytes: {
    label: "Default storage quota per user",
    help: "Bytes each account may store. Per-user overrides still win. 0 = unlimited.",
    group: "limits",
    control: "bytes",
  },
  upload_max_size_bytes: {
    label: "Maximum upload size",
    help: "Largest single video file an upload or URL import may be. 0 = no cap; otherwise at least 1 MiB.",
    group: "limits",
    control: "bytes",
  },
  upload_max_active_sessions_per_user: {
    label: "Max concurrent uploads per user",
    help: "Resumable upload sessions one user may hold open at once. 0 = unlimited.",
    group: "limits",
    control: "number",
  },
  import_max_height: {
    label: "Import resolution cap",
    help: "Highest resolution URL imports fetch. 0 = no cap; otherwise 144–4320.",
    group: "limits",
    control: "number",
  },
};

const POLICY_OPTIONS = [
  { value: "hide", label: "Hide" },
  { value: "warn", label: "Warn" },
  { value: "blur", label: "Blur" },
  { value: "display", label: "Display" },
] as const;

/** The empty/default draft value for a control kind (missing-key rows). */
function emptyValueFor(control: ControlKind): SettingValue {
  if (control === "toggle") return false;
  if (control === "category-multi" || control === "language-multi") return [];
  if (control === "number" || control === "bytes") return 0;
  return "";
}

function controlFor(key: string, setting: AdminInstanceSetting | undefined): ControlKind {
  const meta = META[key];
  if (meta) return meta.control;
  // Unknown server key ("Other settings"): render by server type. A future
  // unknown enum/list kind falls back to a plain text row (it stays visible;
  // proper editing arrives with its META entry).
  if (setting?.type === "bool") return "toggle";
  if (setting?.type === "int") return "number";
  return "text";
}

function sameValue(a: SettingValue | undefined, b: SettingValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => v === b[i])
    );
  }
  return a === b;
}

// AdminInstanceConfigView is the admin-only instance configuration page
// (redesigned per .ralph/specs/instance-platform-info.md). It loads the
// effective settings overlay (GET /admin/instance-settings), renders the FULL
// grouped form from META — a key the backend does not return yet renders
// disabled instead of vanishing — and persists a partial PATCH of only the
// changed keys on save. Overridden keys get an accent badge + a
// reset-to-default action ({key: null}); a key at its config default shows no
// badge at all. Role-gated by RoleGate.
export function AdminInstanceConfigView() {
  return (
    <RoleGate minRole="admin" action="configure the instance">
      <ConfigForm />
    </RoleGate>
  );
}

// Exported for unit tests (rendered directly, bypassing the RoleGate wrapper —
// the same pattern AdminJobRunsView uses). Production always enters via
// AdminInstanceConfigView so the admin gate applies.
export function ConfigForm() {
  const [status, setStatus] = useState<Status>("loading");
  const [settings, setSettings] = useState<AdminInstanceSetting[]>([]);
  // The editable working copy, keyed by setting key. Reseeded from the server
  // truth on every successful load/save (so the UI reflects effective values).
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // The key currently having its override cleared (per-row spinner/disable).
  const [resetting, setResetting] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // The shared markdown-preview modal: which field is being previewed.
  const [preview, setPreview] = useState<{ label: string; text: string } | null>(null);
  // The taxonomy for the language/category selects (null until loaded; a failed
  // fetch leaves the selects with their current value and the multi-selects
  // showing an honest "options unavailable" note).
  const [config, setConfig] = useState<VideoConfigResponse | null>(null);

  const seed = useCallback((list: AdminInstanceSetting[]) => {
    setSettings(list);
    const next: Record<string, SettingValue> = {};
    for (const s of list) {
      // Defensive: a list kind whose value is not an array (mid-migration
      // backend) is treated as empty rather than crashing the form.
      next[s.key] = s.type === "list" && !Array.isArray(s.value) ? [] : s.value;
    }
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

  useEffect(() => {
    let cancelled = false;
    getVideoConfigCached()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        // Selects fall back to raw values; multi-selects show "unavailable".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The set of keys whose draft value differs from the effective server value.
  const changedKeys = useMemo(
    () => settings.filter((s) => !sameValue(draft[s.key], s.value)).map((s) => s.key),
    [settings, draft],
  );
  const dirty = changedKeys.length > 0;

  const setValue = useCallback((key: string, value: SettingValue) => {
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
    // Partial update: only the changed keys travel. List values are JSON arrays.
    const patch: UpdateInstanceSettingsRequest = {};
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

  const renderGroup = (group: (typeof GROUPS)[number]) => {
    // Meta-defined keys render in META order — INCLUDING keys the backend does
    // not return yet (they render disabled). Unknown server keys land in "other".
    const keys =
      group.id === "other"
        ? settings.filter((s) => !META[s.key]).map((s) => s.key)
        : Object.keys(META).filter((key) => META[key].group === group.id);
    if (keys.length === 0) return null;
    return (
      <section key={group.id} aria-label={group.title} className="flex min-w-0 flex-col gap-2.5">
        <div className="px-0.5">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
            {group.title}
          </h2>
          <p className="mt-1 text-[13px] text-fg-muted">{group.description}</p>
        </div>
        <div className="flex min-w-0 flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted p-4">
          {keys.map((key) => (
            <SettingRow
              key={key}
              settingKey={key}
              setting={byKey.get(key)}
              config={config}
              draftValue={draft[key]}
              error={fieldErrors[key]}
              resetting={resetting === key}
              disabled={saving}
              onChange={(v) => setValue(key, v)}
              onReset={() => void resetToDefault(key)}
              onPreview={(label, text) => setPreview({ label, text })}
            />
          ))}
        </div>
      </section>
    );
  };

  // Desktop console (DR12): two columns at lg — the long editorial groups on
  // the left, the compact toggle groups on the right. Below lg it collapses to
  // the single mobile stack in GROUPS order.
  const rightIds: GroupId[] = ["registration", "features", "limits", "other-info", "other"];
  const leftGroups = GROUPS.filter((g) => !rightIds.includes(g.id));
  const rightGroups = GROUPS.filter((g) => rightIds.includes(g.id));

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex min-w-0 flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
        <div className="flex min-w-0 flex-col gap-8">{leftGroups.map(renderGroup)}</div>
        <div className="flex min-w-0 flex-col gap-8">{rightGroups.map(renderGroup)}</div>
      </div>

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

      {preview ? (
        <Modal
          title={`Preview: ${preview.label}`}
          onClose={() => setPreview(null)}
          className="max-w-2xl"
        >
          <div className="max-h-[70vh] overflow-y-auto">
            {preview.text.trim() === "" ? (
              <p className="text-sm text-fg-muted">Nothing to preview yet.</p>
            ) : (
              <Markdown>{preview.text}</Markdown>
            )}
          </div>
        </Modal>
      ) : null}
    </form>
  );
}

function SettingRow({
  settingKey,
  setting,
  config,
  draftValue,
  error,
  resetting,
  disabled,
  onChange,
  onReset,
  onPreview,
}: {
  settingKey: string;
  /** The server's effective row — undefined until the backend supports the key. */
  setting: AdminInstanceSetting | undefined;
  config: VideoConfigResponse | null;
  draftValue: SettingValue | undefined;
  error?: string;
  resetting: boolean;
  disabled: boolean;
  onChange: (value: SettingValue) => void;
  onReset: () => void;
  onPreview: (label: string, text: string) => void;
}) {
  const meta = META[settingKey];
  const label = meta?.label ?? settingKey;
  const control = controlFor(settingKey, setting);
  // A key the backend does not return yet renders its full row, disabled —
  // never a crash, never a hidden field (spec: instance-platform-info.md).
  const unsupported = setting === undefined;
  const inactive = disabled || resetting || unsupported;
  const value = draftValue ?? emptyValueFor(control);
  const text = typeof value === "string" ? value : "";
  const list = Array.isArray(value) ? value : [];
  const num = typeof value === "number" ? value : 0;

  const isMarkdown = control === "markdown";
  const isToggle = control === "toggle";

  return (
    <div className="flex min-w-0 flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium text-fg">{label}</span>
          {meta?.help ? (
            <span className="block text-xs text-fg-muted">{meta.help}</span>
          ) : null}
          {unsupported ? (
            <span className="block text-xs text-fg-muted">
              Not supported by this server yet.
            </span>
          ) : null}
          {/* Badge treatment: ONLY an overridden key gets a badge (+ reset);
              a key at its config default shows nothing. */}
          {setting?.overridden ? (
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="accent">Overridden</Badge>
              <button
                type="button"
                onClick={onReset}
                disabled={resetting || disabled}
                className="focus-ring rounded text-xs text-fg-muted underline underline-offset-2 hover:text-fg disabled:opacity-60"
              >
                {resetting ? "Resetting…" : "Reset to default"}
              </button>
            </div>
          ) : null}
        </div>
        {isToggle ? (
          <Toggle
            checked={value === true}
            onChange={(next) => onChange(next)}
            label={label}
            disabled={inactive}
          />
        ) : null}
        {isMarkdown ? (
          <Button
            type="button"
            variant="tonal"
            size="sm"
            aria-label={`Preview ${label}`}
            onClick={() => onPreview(label, text)}
          >
            Preview
          </Button>
        ) : null}
      </div>

      {control === "text" ? (
        <Input
          aria-label={label}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={meta?.placeholder}
          error={error}
          disabled={inactive}
        />
      ) : null}

      {control === "number" || control === "bytes" ? (
        <div className="flex flex-col gap-1">
          <Input
            aria-label={label}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={String(num)}
            onChange={(e) => {
              const n = Math.trunc(Number(e.target.value));
              onChange(Number.isFinite(n) && n > 0 ? n : 0);
            }}
            placeholder={meta?.placeholder}
            error={error}
            disabled={inactive}
          />
          {control === "bytes" ? (
            <span className="text-xs text-fg-muted">
              {num > 0 ? `= ${formatBytes(num)}` : "Unlimited"}
            </span>
          ) : null}
        </div>
      ) : null}

      {control === "textarea" || isMarkdown ? (
        <Textarea
          aria-label={label}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={meta?.placeholder}
          rows={isMarkdown ? 5 : 3}
          error={error}
          disabled={inactive}
          className="resize-y"
        />
      ) : null}

      {control === "language-select" ? (
        <TaxonomySelectControl
          label={label}
          value={text}
          options={config?.languages ?? []}
          onChange={onChange}
          error={error}
          disabled={inactive}
        />
      ) : null}

      {control === "country-select" ? (
        <Select
          aria-label={label}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          disabled={inactive}
        >
          <option value="">Not specified</option>
          {text !== "" && !COUNTRIES.some((c) => c.name === text) ? (
            <option value={text}>{text}</option>
          ) : null}
          {COUNTRIES.map((c) => (
            // The backend stores the display NAME string (spec) — the code is
            // only the stable React key.
            <option key={c.code} value={c.name}>
              {c.name}
            </option>
          ))}
        </Select>
      ) : null}

      {control === "category-multi" || control === "language-multi" ? (
        <MultiSelectList
          label={label}
          options={(control === "category-multi" ? config?.categories : config?.languages) ?? []}
          value={list}
          onChange={onChange}
          error={error}
          disabled={inactive}
        />
      ) : null}

      {control === "policy-segmented" ? (
        <div className="flex flex-col gap-1">
          <SegmentedControl
            options={POLICY_OPTIONS}
            value={(text || "hide") as (typeof POLICY_OPTIONS)[number]["value"]}
            onChange={(next) => onChange(next)}
            label={label}
            size="sm"
            disabled={inactive}
          />
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      ) : null}

      {isToggle && error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

// TaxonomySelectControl — a Select over {id,label} taxonomy options that keeps
// an unknown current value selectable (options unavailable, or a value the
// backend added after this client was built) instead of clobbering it.
function TaxonomySelectControl({
  label,
  value,
  options,
  onChange,
  error,
  disabled,
}: {
  label: string;
  value: string;
  options: VideoConfigOption[];
  onChange: (value: string) => void;
  error?: string;
  disabled: boolean;
}) {
  const known = options.some((o) => o.id === value);
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      disabled={disabled}
    >
      <option value="">Not set</option>
      {value !== "" && !known ? <option value={value}>{value}</option> : null}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

// MultiSelectList — the token-conformant multi-select for list-kind settings:
// a bordered rounded-xl checkbox list (native checkboxes via the Checkbox
// primitive; no new UI library), scrollable past ~5 rows. The produced array
// follows taxonomy order so a round-trip is stable.
function MultiSelectList({
  label,
  options,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string;
  options: VideoConfigOption[];
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
  disabled: boolean;
}) {
  function toggle(id: string, checked: boolean) {
    const set = new Set(value);
    if (checked) set.add(id);
    else set.delete(id);
    onChange(options.filter((o) => set.has(o.id)).map((o) => o.id));
  }
  return (
    <div className="flex flex-col gap-1">
      <div
        role="group"
        aria-label={label}
        className="flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-xl border border-border bg-surface p-1.5"
      >
        {options.length === 0 ? (
          <p className="px-2 py-1 text-xs text-fg-muted">Options are unavailable right now.</p>
        ) : (
          options.map((o) => (
            <div key={o.id} className="rounded-lg px-2 py-1 hover:bg-surface-muted">
              <Checkbox
                label={o.label}
                checked={value.includes(o.id)}
                disabled={disabled}
                onChange={(e) => toggle(o.id, e.target.checked)}
              />
            </div>
          ))
        )}
      </div>
      <p className="text-xs text-fg-muted">
        {value.length === 0 ? "None selected." : `${value.length} selected.`}
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
