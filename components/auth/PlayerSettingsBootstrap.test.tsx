// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: {
    status: "restoring" as "restoring" | "anon" | "authed",
    user: null as { id: string } | null,
  },
  getPlayerSettings: vi.fn(),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => mocks.session,
}));

vi.mock("@/lib/api", () => ({
  api: { getPlayerSettings: mocks.getPlayerSettings },
}));

import { PlayerSettingsBootstrap } from "./PlayerSettingsBootstrap";
import {
  DEFAULT_PLAYER_SETTINGS,
  arePlayerSettingsHydrated,
  arePlayerSettingsSettled,
  getPlayerSettingsSnapshot,
  hydratePlayerSettings,
  unsettlePlayerSettingsForTests,
} from "@/lib/player-settings";
import {
  VIDEO_CARD_PREVIEW_AUDIO_KEY,
  readVideoCardPreviewMuted,
  resetVideoCardPreviewAudio,
  setVideoCardPreviewMuted,
} from "@/lib/video-card-preview-session";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.session.status = "restoring";
  mocks.session.user = null;
  unsettlePlayerSettingsForTests();
  resetVideoCardPreviewAudio();
});

describe("PlayerSettingsBootstrap", () => {
  it("waits for authentication to settle before requesting account preferences", () => {
    render(<PlayerSettingsBootstrap />);
    expect(mocks.getPlayerSettings).not.toHaveBeenCalled();
    expect(arePlayerSettingsSettled()).toBe(false);
  });

  it("hydrates the signed-in account once for browse and watch surfaces", async () => {
    const settings = {
      ...DEFAULT_PLAYER_SETTINGS,
      video_card_previews_enabled: true,
    };
    mocks.session.status = "authed";
    mocks.session.user = { id: "user-1" };
    mocks.getPlayerSettings.mockResolvedValue(settings);

    render(<PlayerSettingsBootstrap />);

    await waitFor(() => expect(mocks.getPlayerSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(arePlayerSettingsHydrated()).toBe(true));
    expect(getPlayerSettingsSnapshot()).toEqual(settings);
  });

  it("clears a previous account's opt-in when the visitor is anonymous", () => {
    hydratePlayerSettings({
      ...DEFAULT_PLAYER_SETTINGS,
      video_card_previews_enabled: true,
    });
    mocks.session.status = "anon";

    render(<PlayerSettingsBootstrap />);

    expect(getPlayerSettingsSnapshot()).toEqual(DEFAULT_PLAYER_SETTINGS);
    expect(arePlayerSettingsHydrated()).toBe(false);
    expect(arePlayerSettingsSettled()).toBe(true);
  });

  it("returns preview audio to muted when the account session ends", () => {
    setVideoCardPreviewMuted(false);
    expect(readVideoCardPreviewMuted()).toBe(false);
    mocks.session.status = "anon";

    render(<PlayerSettingsBootstrap />);

    expect(readVideoCardPreviewMuted()).toBe(true);
    expect(window.sessionStorage.getItem(VIDEO_CARD_PREVIEW_AUDIO_KEY)).toBeNull();
  });
});
