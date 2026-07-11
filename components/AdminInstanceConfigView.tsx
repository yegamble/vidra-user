"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Markdown } from "@/components/Markdown";
import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import {
  META,
  bootDepNote,
  buildPageModel,
  configPage,
  controlFor,
  describeSettingDefault,
  emptyValueFor,
  type ConfigPageId,
  type InstanceBootInfo,
  type PageSection,
  type PlacedInstanceSetting,
  type SettingValue,
} from "@/lib/admin-config-ia";
import {
  ApiError,
  api,
  errorMessage,
  getInstanceCached,
  getVideoConfigCached,
} from "@/lib/api";
import type {
  InstanceSetting,
  InstanceSettingsResponse,
  UpdateInstanceSettingsRequest,
  VideoConfigOption,
  VideoConfigResponse,
} from "@/lib/api";
import { COUNTRIES } from "@/lib/countries";
import { formatBytes } from "@/lib/format";

type Status = "loading" | "error" | "ready";

type AdminInstanceSetting = InstanceSetting;

const POLICY_OPTIONS = [
  { value: "hide", label: "Hide" },
  { value: "warn", label: "Warn" },
  { value: "blur", label: "Blur" },
  { value: "display", label: "Display" },
] as const;

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

function sectionAnchorId(sectionId: string): string {
  return `config-section-${sectionId}`;
}

// AdminInstanceConfigView is one PAGE of the admin instance configuration
// (config-parity W2 IA: general | vod | live | federation | customization |
// homepage | advanced — see lib/admin-config-ia.ts). It loads the effective
// settings overlay (GET /admin/instance-settings), renders THIS page's grouped
// inset sections from the placement registry — server page/section metadata
// wins when present, unknown keys auto-render so a new setting is never
// hidden, and a key the backend does not return yet renders disabled instead
// of vanishing — and persists a partial PATCH of only the changed keys on
// save (whole page via the sticky save bar, or one section at a time).
// Overridden keys get an accent badge, their config default, and a
// reset-to-default action ({key: null}); a key at its config default shows no
// badge at all. Role-gated by RoleGate.
export function AdminInstanceConfigView({ page }: { page: ConfigPageId }) {
  return (
    <RoleGate minRole="admin" action="configure the instance">
      <ConfigForm page={page} />
    </RoleGate>
  );
}

// Exported for unit tests (rendered directly, bypassing the RoleGate wrapper —
// the same pattern AdminJobRunsView uses). Production always enters via
// AdminInstanceConfigView so the admin gate applies.
export function ConfigForm({ page }: { page: ConfigPageId }) {
  const [status, setStatus] = useState<Status>("loading");
  const [settings, setSettings] = useState<AdminInstanceSetting[]>([]);
  // The editable working copy, keyed by setting key. Reseeded from the server
  // truth on every successful load/save (so the UI reflects effective values).
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  // Server-side rejections (422 field errors) and immediate client-side
  // validation, merged per row; a client error blocks saving that key.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
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
  // The public /instance snapshot, used for boot-dependency notes (a setting
  // whose boot-env backing is absent renders disabled with an explanation, and
  // some pages carry a page-wide note). Best-effort: null just means no notes.
  const [instance, setInstance] = useState<InstanceBootInfo | null>(null);

  const seed = useCallback((list: AdminInstanceSetting[]) => {
    setSettings(list);
    const next: Record<string, SettingValue> = {};
    for (const s of list) {
      // Defensive: a list kind whose value is not an array (mid-migration
      // backend) is treated as empty rather than crashing the form.
      next[s.key] = s.type === "list" && !Array.isArray(s.value) ? [] : s.value;
    }
    setDraft(next);
    setClientErrors({});
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
    getInstanceCached()
      .then((doc) => {
        if (!cancelled) setInstance(doc as InstanceBootInfo);
      })
      .catch(() => {
        // No boot-dependency notes; rows render normally.
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
  const invalid = changedKeys.some((key) => clientErrors[key] !== undefined);

  const setValue = useCallback((key: string, value: SettingValue) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
    // Immediate inline validation (HIG): the row tells you right away.
    const validate = META[key]?.validate;
    setClientErrors((prev) => {
      const message = validate ? validate(value) : null;
      if (message === null) {
        if (prev[key] === undefined) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: message };
    });
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

  // Persist a partial PATCH of the changed keys — all of them (the sticky save
  // bar) or one section's slice (per-section save).
  const save = useCallback(
    async (keys?: string[]) => {
      const toSave = (keys ?? changedKeys).filter((key) => changedKeys.includes(key));
      if (toSave.length === 0 || saving) return;
      if (toSave.some((key) => clientErrors[key] !== undefined)) return;
      setSaving(true);
      setSaved(false);
      setSaveError(null);
      setFieldErrors({});
      // Partial update: only the changed keys travel. List values are JSON arrays.
      const patch: UpdateInstanceSettingsRequest = {};
      for (const key of toSave) patch[key] = draft[key];
      // A section save must not clobber edits elsewhere: reseeding from the
      // response resets every draft, so re-apply the kept dirty keys onto the
      // fresh truth afterwards.
      const kept: Record<string, SettingValue> = {};
      for (const key of changedKeys) {
        if (toSave.includes(key)) continue;
        const value = draft[key];
        if (value !== undefined) kept[key] = value;
      }
      try {
        const res = await api.updateInstanceSettings(patch);
        applyResult(res);
        if (Object.keys(kept).length > 0) {
          setDraft((prev) => ({ ...prev, ...kept }));
        }
        setSaved(true);
      } catch (err) {
        onError(err);
      } finally {
        setSaving(false);
      }
    },
    [changedKeys, saving, clientErrors, draft, applyResult, onError],
  );

  // Throw away every unsaved edit, back to the server truth.
  const discard = useCallback(() => {
    seed(settings);
    setFieldErrors({});
    setSaveError(null);
    setSaved(false);
  }, [seed, settings]);

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

  const pageDef = configPage(page);
  const model = useMemo(
    () => buildPageModel(page, settings as PlacedInstanceSetting[]),
    [page, settings],
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
  const pageBootNote = instance && pageDef.bootNote ? pageDef.bootNote(instance) : null;

  // Progressive disclosure: a child row stays hidden while its parent toggle
  // is off. A parent the server does not return cannot vouch either way, so
  // the child stays visible (it renders disabled on its own merits anyway).
  const isVisible = (key: string): boolean => {
    const parent = META[key]?.parent;
    if (!parent || byKey.get(parent) === undefined) return true;
    return draft[parent] === true;
  };

  const renderSection = ({ section, keys }: PageSection) => {
    const visibleKeys = keys.filter(isVisible);
    if (visibleKeys.length === 0) return null;
    const sectionChanged = keys.filter((key) => changedKeys.includes(key));
    const sectionInvalid = sectionChanged.some((key) => clientErrors[key] !== undefined);
    const headingId = sectionAnchorId(section.id);
    return (
      <section
        key={section.id}
        aria-label={section.title}
        id={headingId}
        className="flex min-w-0 scroll-mt-24 flex-col gap-2.5"
      >
        <div className="flex items-end justify-between gap-3 px-0.5">
          <div className="min-w-0">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
              {section.title}
            </h2>
            {section.description ? (
              <p className="mt-1 text-[13px] text-fg-muted">{section.description}</p>
            ) : null}
          </div>
          {sectionChanged.length > 0 ? (
            <Button
              type="button"
              variant="tonal"
              size="sm"
              className="shrink-0"
              disabled={saving || sectionInvalid}
              onClick={() => void save(sectionChanged)}
              aria-label={`Save ${section.title}`}
            >
              Save section
            </Button>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted p-4">
          {visibleKeys.map((key) => (
            <SettingRow
              key={key}
              settingKey={key}
              setting={byKey.get(key)}
              config={config}
              draftValue={draft[key]}
              error={fieldErrors[key] ?? clientErrors[key]}
              bootNote={bootDepNote(META[key], instance)}
              child={META[key]?.parent !== undefined}
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

  return (
    <div className="flex min-w-0 items-start gap-8">
      <form
        className="flex min-w-0 max-w-3xl flex-1 flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {pageBootNote ? (
          <p
            role="note"
            className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-[13px] text-fg-muted"
          >
            {pageBootNote}
          </p>
        ) : null}

        {model.length === 0 ? (
          <EmptyState
            title="Nothing to configure here yet"
            message="Settings for this page arrive with a later server update — they will appear here automatically."
          />
        ) : (
          <>
            {model.map(renderSection)}

            {/* Sticky save bar (HIG): the dirty-diff count and the whole-page
                save stay in reach however long the page is. In-flow on the
                smallest screens so it never fights the bottom tab bar. */}
            <div className="z-10 flex flex-wrap items-center gap-3 border-t border-border-subtle bg-canvas py-3 sm:sticky sm:bottom-0">
              <Button type="submit" disabled={!dirty || saving || invalid}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              {dirty ? (
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={discard}>
                    Discard
                  </Button>
                  <span className="text-sm text-fg-muted">
                    {changedKeys.length} unsaved {changedKeys.length === 1 ? "change" : "changes"}
                  </span>
                </>
              ) : null}
              {/* Independent of dirtiness: a per-section save succeeds while
                  other sections still hold pending edits. */}
              {saved ? (
                <span role="status" className="text-sm text-success">
                  Settings saved.
                </span>
              ) : null}
              {invalid ? (
                <span role="alert" className="text-sm text-danger">
                  Fix the highlighted fields to save.
                </span>
              ) : saveError ? (
                <span role="alert" className="text-sm text-danger">
                  {saveError}
                </span>
              ) : null}
            </div>
          </>
        )}

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

      {/* The in-page anchor rail: PeerTube-style side-labels for this page's
          sections (desktop only; the sections themselves carry the headers). */}
      {model.length > 1 ? (
        <nav
          aria-label="On this page"
          className="sticky top-24 hidden w-44 shrink-0 flex-col gap-0.5 xl:flex"
        >
          <span className="px-2 pb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-fg-muted">
            On this page
          </span>
          {model.map(({ section }) => (
            <a
              key={section.id}
              href={`#${sectionAnchorId(section.id)}`}
              className="focus-ring rounded-lg px-2 py-1 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              {section.title}
            </a>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function SettingRow({
  settingKey,
  setting,
  config,
  draftValue,
  error,
  bootNote,
  child,
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
  /** Non-null when the setting's boot-env dependency is absent: disable + explain. */
  bootNote: string | null;
  /** True for a progressive-disclosure child (renders indented under its parent). */
  child: boolean;
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
  const inactive = disabled || resetting || unsupported || bootNote !== null;
  const value = draftValue ?? emptyValueFor(control);
  const text = typeof value === "string" ? value : "";
  const list = Array.isArray(value) ? value : [];
  const num = typeof value === "number" ? value : 0;

  const isMarkdown = control === "markdown";
  const isToggle = control === "toggle";

  return (
    <div
      className={`flex min-w-0 flex-col gap-2 py-3.5 first:pt-0 last:pb-0 ${
        child ? "border-l-2 border-border-subtle pl-4" : ""
      }`}
    >
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
          {bootNote !== null && !unsupported ? (
            <span className="block text-xs text-fg-muted">{bootNote}</span>
          ) : null}
          {/* Badge treatment: ONLY an overridden key gets a badge (+ its config
              default and the reset affordance); a key at its config default
              shows nothing. */}
          {setting?.overridden ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="accent">Overridden</Badge>
              <span className="text-xs text-fg-muted">
                Default: {describeSettingDefault(setting, control)}
              </span>
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
