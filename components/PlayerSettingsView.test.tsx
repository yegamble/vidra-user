// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let sessionStatus = "authed";
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus }),
}));

const DEFAULTS = {
  autoplay_next: true,
  default_speed: 1,
  default_quality: "auto",
  captions_default: false,
  theater_default: false,
  video_card_previews_enabled: false,
};

vi.mock("@/lib/api", () => ({
  api: {
    getPlayerSettings: vi.fn(),
    updatePlayerSettings: vi.fn(),
  },
  errorMessage: (_err: unknown, fallback?: string) => fallback ?? "Something went wrong.",
}));

import { api } from "@/lib/api";
import { resetPlayerSettings } from "@/lib/player-settings";

import { PlayerSettingsView } from "./PlayerSettingsView";

const getPlayerSettings = vi.mocked(api.getPlayerSettings);
const updatePlayerSettings = vi.mocked(api.updatePlayerSettings);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetPlayerSettings();
  sessionStatus = "authed";
});

describe("PlayerSettingsView", () => {
  it("prompts anonymous viewers to sign in and never fetches", () => {
    sessionStatus = "anon";
    render(<PlayerSettingsView />);
    expect(screen.getByText("Sign in to manage playback")).toBeTruthy();
    expect(getPlayerSettings).not.toHaveBeenCalled();
  });

  it("loads the settings and renders every control at its current value", async () => {
    getPlayerSettings.mockResolvedValue({
      ...DEFAULTS,
      default_speed: 1.5,
      default_quality: "1080p",
      theater_default: true,
    });
    render(<PlayerSettingsView />);

    const autoplay = await screen.findByRole("switch", { name: "Autoplay next" });
    expect(autoplay.getAttribute("aria-checked")).toBe("true");
    expect(
      (screen.getByLabelText("Default speed") as HTMLSelectElement).value,
    ).toBe("1.5");
    expect(
      (screen.getByLabelText("Default quality") as HTMLSelectElement).value,
    ).toBe("1080p");
    expect(
      screen.getByRole("switch", { name: "Captions on by default" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen.getByRole("switch", { name: "Inline video previews" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen.getByRole("switch", { name: "Theater mode by default" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("toggling a switch PUTs only that field (merge) and reflects the server response", async () => {
    getPlayerSettings.mockResolvedValue({ ...DEFAULTS });
    updatePlayerSettings.mockResolvedValue({ ...DEFAULTS, autoplay_next: false });
    render(<PlayerSettingsView />);

    const autoplay = await screen.findByRole("switch", { name: "Autoplay next" });
    fireEvent.click(autoplay);

    await waitFor(() => expect(updatePlayerSettings).toHaveBeenCalledTimes(1));
    // Merge-PUT: only the changed field is sent.
    expect(updatePlayerSettings).toHaveBeenCalledWith({ autoplay_next: false });
    expect(
      screen.getByRole("switch", { name: "Autoplay next" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("saves the user's inline-preview opt-in independently", async () => {
    getPlayerSettings.mockResolvedValue({ ...DEFAULTS });
    updatePlayerSettings.mockResolvedValue({
      ...DEFAULTS,
      video_card_previews_enabled: true,
    });
    render(<PlayerSettingsView />);

    const previews = await screen.findByRole("switch", { name: "Inline video previews" });
    fireEvent.click(previews);

    await waitFor(() =>
      expect(updatePlayerSettings).toHaveBeenCalledWith({ video_card_previews_enabled: true }),
    );
    expect(previews.getAttribute("aria-checked")).toBe("true");
  });

  it("changing the default speed PUTs only default_speed as a number", async () => {
    getPlayerSettings.mockResolvedValue({ ...DEFAULTS });
    updatePlayerSettings.mockResolvedValue({ ...DEFAULTS, default_speed: 1.5 });
    render(<PlayerSettingsView />);

    const speed = (await screen.findByLabelText("Default speed")) as HTMLSelectElement;
    fireEvent.change(speed, { target: { value: "1.5" } });

    await waitFor(() => expect(updatePlayerSettings).toHaveBeenCalledWith({ default_speed: 1.5 }));
    expect((screen.getByLabelText("Default speed") as HTMLSelectElement).value).toBe("1.5");
  });

  it("changing the default quality PUTs only default_quality", async () => {
    getPlayerSettings.mockResolvedValue({ ...DEFAULTS });
    updatePlayerSettings.mockResolvedValue({ ...DEFAULTS, default_quality: "720p" });
    render(<PlayerSettingsView />);

    const quality = (await screen.findByLabelText("Default quality")) as HTMLSelectElement;
    fireEvent.change(quality, { target: { value: "720p" } });

    await waitFor(() =>
      expect(updatePlayerSettings).toHaveBeenCalledWith({ default_quality: "720p" }),
    );
  });

  it("reverts the control and shows an error when the save fails", async () => {
    getPlayerSettings.mockResolvedValue({ ...DEFAULTS });
    updatePlayerSettings.mockRejectedValue(new Error("boom"));
    render(<PlayerSettingsView />);

    const captions = await screen.findByRole("switch", { name: "Captions on by default" });
    expect(captions.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(captions); // optimistically on

    await screen.findByRole("alert");
    // Reverted back to off after the failed PUT.
    expect(
      screen.getByRole("switch", { name: "Captions on by default" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("shows a retry affordance when the initial load fails", async () => {
    getPlayerSettings.mockRejectedValueOnce(new Error("down"));
    getPlayerSettings.mockResolvedValueOnce({ ...DEFAULTS });
    render(<PlayerSettingsView />);

    const retry = await screen.findByRole("button", { name: /retry|try again/i });
    fireEvent.click(retry);
    expect(await screen.findByRole("switch", { name: "Autoplay next" })).toBeTruthy();
  });
});
