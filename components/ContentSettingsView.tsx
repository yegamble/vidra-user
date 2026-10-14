"use client";

import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { api, errorMessage, getVideoConfigCached } from "@/lib/api";
import type { VideoConfigOption } from "@/lib/api";
import type { SensitiveContentPolicy, UpdateProfileRequest } from "@/lib/api";
import { hydrateContentPreferences, useContentPreferences } from "@/lib/content-preferences";
import type { PlainMessageKey } from "@/lib/i18n";
import { SENSITIVE_FLAGS } from "@/lib/sensitive-flags";
import { useInstanceSensitivePolicy } from "@/lib/use-sensitive-policy";
import { useT } from "@/components/I18nProvider";
import { SignInGate } from "@/components/SignInGate";
import { Checkbox } from "@/components/ui/Checkbox";

type SaveState = "idle" | "saving" | "saved" | "error";

// The select value: the four real policies, plus "" meaning "inherit the
// instance default".
type PolicyChoice = SensitiveContentPolicy | "";

// Human-readable label for each policy (also used inside the "Use instance
// default (…)" option so the viewer knows what inheriting currently means).
const POLICY_LABEL: Record<SensitiveContentPolicy, PlainMessageKey> = {
  display: "settings.content.policy.display",
  warn: "settings.content.policy.warn",
  blur: "settings.content.policy.blur",
  hide: "settings.content.policy.hide",
};

// ContentSettingsView is the "Sensitive content" account page: a single per-user
// override of the instance sensitive_content_policy (PATCH /auth/me), persisted
// as one of hide/warn/blur/display or an empty string (inherit). It mirrors the
// SearchSettingsView pattern — a settled signed-out session gets the sign-in
// prompt; a hard reload shows a loading state until the refresh cookie restores
// the session.
export function ContentSettingsView() {
  const t = useT();
  const { status, user } = useSession();

  if (status === "anon" || !user) {
    return (
      <SignInGate
        title={t("settings.content.gate.title")}
        lead={t("settings.content.gate.lead")}
        restoringLabel={t("settings.content.gate.restoring")}
      >
        {t("settings.content.gate.body")}
      </SignInGate>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <SensitiveContentSection
        key={user.id}
        initial={(user.sensitive_content_policy ?? "") as PolicyChoice}
      />
      <FlagPoliciesSection key={`${user.id}-flags`} />
      <LanguagesSection key={`${user.id}-langs`} />
    </div>
  );
}

// The single per-user sensitive-content override. Auto-saves the changed value
// (PATCH /auth/me) and reflects a polite saved-status line; a failed save
// reverts the selection and reports the error.
function SensitiveContentSection({ initial }: { initial: PolicyChoice }) {
  const t = useT();
  const { updateProfile } = useSession();
  // The raw INSTANCE policy powers the "Use instance default (…)" label so the
  // viewer sees what inheriting resolves to right now.
  const instancePolicy = useInstanceSensitivePolicy();
  const [choice, setChoice] = useState<PolicyChoice>(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const inheritLabel = instancePolicy
    ? t("settings.content.inheritNamed", { policy: t(POLICY_LABEL[instancePolicy]) })
    : t("settings.content.inherit");

  async function change(value: PolicyChoice) {
    const previous = choice;
    setChoice(value);
    setSaveState("saving");
    setError(null);
    try {
      // "" clears the override back to inherit; the four values set it.
      const patch: UpdateProfileRequest = { sensitive_content_policy: value };
      await updateProfile(patch);
      setSaveState("saved");
    } catch (err) {
      setChoice(previous);
      setSaveState("error");
      setError(errorMessage(err, t("settings.content.saveError")));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-fg">{t("settings.content.sensitive.title")}</h2>
        <p className="text-[13px] text-fg-muted">
          {t("settings.content.sensitive.intro")}
        </p>
      </div>

      {/* Polite, non-focus-stealing save status (design-system role=status line). */}
      <div role="status" aria-live="polite" className="min-h-5 text-[13px]">
        {saveState === "saving" ? <span className="text-fg-muted">{t("settings.content.saving")}</span> : null}
        {saveState === "saved" ? <span className="text-success">{t("settings.content.saved")}</span> : null}
        {saveState === "error" && error ? <span className="text-danger">{error}</span> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sensitive-content-policy" className="text-sm font-medium text-fg">
          {t("settings.content.sensitive.label")}
        </label>
        <select
          id="sensitive-content-policy"
          name="sensitive-content-policy"
          value={choice}
          onChange={(e) => void change(e.target.value as PolicyChoice)}
          aria-describedby="sensitive-content-policy-help"
          className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
        >
          <option value="">{inheritLabel}</option>
          <option value="display">{t(POLICY_LABEL.display)}</option>
          <option value="warn">{t(POLICY_LABEL.warn)}</option>
          <option value="blur">{t(POLICY_LABEL.blur)}</option>
          <option value="hide">{t(POLICY_LABEL.hide)}</option>
        </select>
        <span id="sensitive-content-policy-help" className="text-xs text-fg-muted">
          {t("settings.content.sensitive.help")}
        </span>
      </div>
    </section>
  );
}

// Per-kind overrides (violent / shocking / sexual) layered on the setting
// above: each kind either follows it ("") or gets its own policy. A video with
// several kinds gets the most restrictive of them. Saved as one PUT of the full
// map; a failed save leaves the previous state and says so.
function FlagPoliciesSection() {
  const t = useT();
  const prefs = useContentPreferences();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function change(flag: string, value: PolicyChoice) {
    setSaveState("saving");
    setError(null);
    try {
      const saved = await api.updateContentPreferences({
        sensitive_flag_policies: { ...prefs.sensitive_flag_policies, [flag]: value },
      });
      hydrateContentPreferences(saved);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(errorMessage(err, t("settings.content.saveError")));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-fg">{t("settings.content.kinds.title")}</h2>
        <p className="text-[13px] text-fg-muted">
          {t("settings.content.kinds.intro")}
        </p>
      </div>
      <div role="status" aria-live="polite" className="min-h-5 text-[13px]">
        {saveState === "saving" ? <span className="text-fg-muted">{t("settings.content.saving")}</span> : null}
        {saveState === "saved" ? <span className="text-success">{t("settings.content.saved")}</span> : null}
        {saveState === "error" && error ? <span className="text-danger">{error}</span> : null}
      </div>
      {SENSITIVE_FLAGS.map((f) => (
        <div key={f.value} className="flex flex-col gap-1.5">
          <label htmlFor={`sensitive-flag-${f.value}`} className="text-sm font-medium text-fg">
            {f.label}
          </label>
          <select
            id={`sensitive-flag-${f.value}`}
            value={prefs.sensitive_flag_policies[f.value] ?? ""}
            onChange={(e) => void change(f.value, e.target.value as PolicyChoice)}
            className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
          >
            <option value="">{t("settings.content.kinds.same")}</option>
            <option value="display">{t(POLICY_LABEL.display)}</option>
            <option value="warn">{t(POLICY_LABEL.warn)}</option>
            <option value="blur">{t(POLICY_LABEL.blur)}</option>
            <option value="hide">{t(POLICY_LABEL.hide)}</option>
          </select>
        </div>
      ))}
    </section>
  );
}

// Preferred languages (PeerTube's videoLanguages): the browse feed shows only
// videos in these languages. Empty = no filter. The feed passes the list as its
// ?language param, and an explicit language filter in the URL still wins.
function LanguagesSection() {
  const t = useT();
  const prefs = useContentPreferences();
  const [options, setOptions] = useState<VideoConfigOption[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVideoConfigCached()
      .then((cfg) => {
        if (!cancelled) setOptions(cfg.languages);
      })
      .catch(() => {
        // No taxonomy: the section simply offers nothing to pick.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = prefs.preferred_languages;

  async function toggle(id: string, on: boolean) {
    const next = on ? [...selected, id] : selected.filter((l) => l !== id);
    setSaveState("saving");
    setError(null);
    try {
      hydrateContentPreferences(await api.updateContentPreferences({ preferred_languages: next }));
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(errorMessage(err, t("settings.content.saveError")));
    }
  }

  if (options.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-fg">{t("settings.content.langs.title")}</h2>
        <p className="text-[13px] text-fg-muted">
          {t("settings.content.langs.intro")}
        </p>
      </div>
      <div role="status" aria-live="polite" className="min-h-5 text-[13px]">
        {saveState === "saving" ? <span className="text-fg-muted">{t("settings.content.saving")}</span> : null}
        {saveState === "saved" ? <span className="text-success">{t("settings.content.saved")}</span> : null}
        {saveState === "error" && error ? <span className="text-danger">{error}</span> : null}
      </div>
      <fieldset className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <legend className="sr-only">{t("settings.content.langs.legend")}</legend>
        {options.map((o) => (
          <Checkbox
            key={o.id}
            label={o.label}
            checked={selected.includes(o.id)}
            disabled={!selected.includes(o.id) && selected.length >= 10}
            onChange={(e) => void toggle(o.id, e.target.checked)}
          />
        ))}
      </fieldset>
    </section>
  );
}
