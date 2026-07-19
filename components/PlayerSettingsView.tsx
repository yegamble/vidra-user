"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { api, errorMessage } from "@/lib/api";
import type { PlayerSettings, UpdatePlayerSettingsRequest } from "@/lib/api";
import { PLAYBACK_RATES, rateLabel } from "@/lib/player-rates";
import { QUALITY_OPTIONS, hydratePlayerSettings } from "@/lib/player-settings";

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
  const { status } = useSession();

  if (status === "restoring") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your account" />
      </div>
    );
  }
  if (status !== "authed") {
    return (
      <EmptyState
        title="Sign in to manage playback"
        message={
          <>
            <Link
              href="/login"
              className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2"
            >
              Sign in
            </Link>{" "}
            to set your default playback preferences.
          </>
        }
      />
    );
  }

  return <Settings />;
}

function Settings() {
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
      setError(errorMessage(err, "Could not save that setting. Please try again."));
    }
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading playback settings" />
      </div>
    );
  }
  if (status === "error" || !settings) {
    return (
      <ErrorState
        message="Could not load your playback settings."
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
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface">
        <SettingRow
          title="Autoplay next"
          desc="Automatically play the next related video when one ends."
          control={
            <Toggle
              checked={settings.autoplay_next}
              onChange={(next) => void save({ autoplay_next: next })}
              label="Autoplay next"
            />
          }
        />
        <SettingRow
          title="Inline video previews"
          desc="Play videos inside cards when you hover. Previews start muted with captions and only work when enabled by the instance administrator. Until you choose, the administrator's instance default applies."
          control={
            <Toggle
              checked={settings.video_card_previews_enabled ?? false}
              onChange={(next) => void save({ video_card_previews_enabled: next })}
              label="Inline video previews"
            />
          }
        />
        <SettingRow
          htmlFor={speedId}
          title="Default speed"
          desc="The speed new videos start playing at."
          control={
            <Select
              id={speedId}
              aria-label="Default speed"
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
          title="Default quality"
          desc="Preferred resolution when a video offers it; otherwise Auto."
          control={
            <Select
              id={qualityId}
              aria-label="Default quality"
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
          title="Captions on by default"
          desc="Turn captions on automatically when a video has them."
          control={
            <Toggle
              checked={settings.captions_default}
              onChange={(next) => void save({ captions_default: next })}
              label="Captions on by default"
            />
          }
        />
        <SettingRow
          title="Theater mode by default"
          desc="Open the player in the wider theater layout on the watch page."
          control={
            <Toggle
              checked={settings.theater_default}
              onChange={(next) => void save({ theater_default: next })}
              label="Theater mode by default"
            />
          }
        />
      </ul>
      <p className="text-xs text-fg-muted">
        These defaults apply to new videos you open. Changing the speed or quality while watching
        only affects that session.
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
