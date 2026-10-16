"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { useT } from "@/components/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { ErrorState } from "@/components/ui/ErrorState";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { api, errorMessage } from "@/lib/api";
import type { PlayerSettings, UpdatePlayerSettingsRequest } from "@/lib/api";
import { PLAYBACK_RATES, rateLabel } from "@/lib/player-rates";
import { QUALITY_OPTIONS, hydratePlayerSettings } from "@/lib/player-settings";
import { SignInGate } from "@/components/SignInGate";

type Status = "loading" | "error" | "ready";

// PlayerSettingsView is the /settings/playback surface (PLAY-07 / W1.6): the
// signed-in user's default playback preferences, wired to
// GET/PUT /api/v1/me/player-settings. Each control saves ITS OWN field (a
// merge-PUT sends only the changed key) optimistically and re-syncs from the
// server's full response; a failed save reverts the control and says so. The
// bespoke player consumes these on the watch page, so a successful save also
// hydrates the shared settings store to update any open player. Session-gated
// like the other settings surfaces (signed-out users use the baked defaults).
export function PlayerSettingsView() {
  const t = useT();
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <SignInGate title={t("settings.playback.gate.title")} restoringLabel={t("settings.playback.gate.restoring")}>
        {t("settings.playback.gate.body")}
      </SignInGate>
    );
  }

  return <Settings />;
}

function Settings() {
  const t = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [settings, setSettings] = useState<PlayerSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const speedId = useId();
  const qualityId = useId();

  useEffect(() => {
    const controller = new AbortController();
    api
      .getPlayerSettings(controller.signal)
      .then((s) => {
        setSettings(s);
        hydratePlayerSettings(s); // any open player picks up the fresh defaults
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  // save PUTs a single-field merge patch, optimistically applying it and then
  // reconciling with the server's full response (the source of truth). A failed
  // save reverts to the pre-save settings.
  async function save(patch: UpdatePlayerSettingsRequest) {
    if (!settings) return;
    const prev = settings;
    setError(null);
    setSettings({ ...settings, ...patch }); // optimistic
    try {
      const res = await api.updatePlayerSettings(patch);
      setSettings(res);
      hydratePlayerSettings(res);
    } catch (err) {
      setSettings(prev); // revert
      setError(errorMessage(err, t("settings.playback.saveError")));
    }
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t("settings.playback.loading")} />
      </div>
    );
  }
  if (status === "error" || !settings) {
    return (
      <ErrorState
        message={t("settings.playback.loadError")}
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert>
          {error}
        </Alert>
      ) : null}
      <ul className="flex flex-col divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface">
        <SettingRow
          title={t("settings.playback.autoplay.title")}
          desc={t("settings.playback.autoplay.desc")}
          control={
            <Toggle
              checked={settings.autoplay_next}
              onChange={(next) => void save({ autoplay_next: next })}
              label={t("settings.playback.autoplay.title")}
            />
          }
        />
        <SettingRow
          title={t("settings.playback.previews.title")}
          desc={t("settings.playback.previews.desc")}
          control={
            <Toggle
              checked={settings.video_card_previews_enabled ?? false}
              onChange={(next) => void save({ video_card_previews_enabled: next })}
              label={t("settings.playback.previews.title")}
            />
          }
        />
        <SettingRow
          htmlFor={speedId}
          title={t("settings.playback.speed.title")}
          desc={t("settings.playback.speed.desc")}
          control={
            <Select
              id={speedId}
              aria-label={t("settings.playback.speed.title")}
              value={String(settings.default_speed)}
              onChange={(e) => void save({ default_speed: Number(e.target.value) })}
              className="w-[7.5rem]"
            >
              {PLAYBACK_RATES.map((r) => (
                <option key={r} value={String(r)}>
                  {rateLabel(r)}
                </option>
              ))}
            </Select>
          }
        />
        <SettingRow
          htmlFor={qualityId}
          title={t("settings.playback.quality.title")}
          desc={t("settings.playback.quality.desc")}
          control={
            <Select
              id={qualityId}
              aria-label={t("settings.playback.quality.title")}
              value={settings.default_quality}
              onChange={(e) => void save({ default_quality: e.target.value })}
              className="w-[7.5rem]"
            >
              {qualityOptions(settings.default_quality).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          }
        />
        <SettingRow
          title={t("settings.playback.captions.title")}
          desc={t("settings.playback.captions.desc")}
          control={
            <Toggle
              checked={settings.captions_default}
              onChange={(next) => void save({ captions_default: next })}
              label={t("settings.playback.captions.title")}
            />
          }
        />
        <SettingRow
          title={t("settings.playback.theater.title")}
          desc={t("settings.playback.theater.desc")}
          control={
            <Toggle
              checked={settings.theater_default}
              onChange={(next) => void save({ theater_default: next })}
              label={t("settings.playback.theater.title")}
            />
          }
        />
      </ul>
      <p className="text-xs text-fg-muted">
        {t("settings.playback.footer")}
      </p>
    </div>
  );
}

// qualityOptions returns the preset quality choices, plus the currently-stored
// value if it is some rung not in the preset list — so an unusual saved default
// still shows as selected rather than silently resetting to Auto in the menu.
function qualityOptions(current: string): ReadonlyArray<{ value: string; label: string }> {
  if (QUALITY_OPTIONS.some((o) => o.value === current)) return QUALITY_OPTIONS;
  return [...QUALITY_OPTIONS, { value: current, label: current }];
}

// SettingRow is one grouped-list row: a title (a real <label> when it drives a
// select) + muted description on the left, and the control on the right.
function SettingRow({
  title,
  desc,
  control,
  htmlFor,
}: {
  title: string;
  desc: string;
  control: ReactNode;
  htmlFor?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
            {title}
          </label>
        ) : (
          <p className="text-sm font-medium text-fg">{title}</p>
        )}
        <p className="mt-0.5 text-[13px] text-fg-muted">{desc}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </li>
  );
}
