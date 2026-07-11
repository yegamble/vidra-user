// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstanceSettings: vi.fn(),
  updateInstanceSettings: vi.fn(),
  getVideoConfigCached: vi.fn(),
  getInstanceCached: vi.fn(),
}));

// Spread the real module (keeping ApiError, errorMessage, and the auth exports
// that RoleGate → AuthProvider need) and override only the calls this view makes.
vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getInstanceSettings: mocks.getInstanceSettings,
      updateInstanceSettings: mocks.updateInstanceSettings,
    },
    getVideoConfigCached: mocks.getVideoConfigCached,
    getInstanceCached: mocks.getInstanceCached,
  };
});

import { ConfigForm } from "./AdminInstanceConfigView";

const doc = {
  settings: [
    { key: "instance_name", type: "string", value: "Test", default: "Test", overridden: false },
    { key: "upload_max_size_bytes", type: "int", value: 2097152, default: 2097152, overridden: false },
    { key: "upload_max_active_sessions_per_user", type: "int", value: 5, default: 5, overridden: false },
    { key: "default_user_quota_bytes", type: "int", value: 0, default: 0, overridden: false },
    { key: "import_max_height", type: "int", value: 1080, default: 1080, overridden: false },
    { key: "imports_enabled", type: "bool", value: true, default: true, overridden: false },
    { key: "registration_enabled", type: "bool", value: false, default: true, overridden: true },
    { key: "registration_require_approval", type: "bool", value: false, default: false, overridden: false },
  ],
};

beforeEach(() => {
  mocks.getInstanceSettings.mockResolvedValue(doc);
  mocks.updateInstanceSettings.mockResolvedValue(doc);
  mocks.getVideoConfigCached.mockResolvedValue({ languages: [], categories: [] });
  mocks.getInstanceCached.mockResolvedValue({ federation_enabled: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminInstanceConfigView limits (VOD page)", () => {
  it("renders int limit rows as number inputs, a bytes hint, and PATCHes a JSON number", async () => {
    render(<ConfigForm page="vod" />);

    // Load completes: the int limit rows render as native number inputs.
    const sessions = await screen.findByLabelText("Max concurrent uploads per user");
    expect(sessions.getAttribute("type")).toBe("number");

    // A bytes-kind limit at 0 shows the "Unlimited" hint (formatBytes echo).
    expect(screen.getByText("Unlimited")).toBeTruthy();

    // Editing the number field and saving sends a JSON NUMBER (not a string),
    // scoped to only the changed key.
    fireEvent.change(sessions, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateInstanceSettings).toHaveBeenCalledTimes(1));
    expect(mocks.updateInstanceSettings).toHaveBeenCalledWith({
      upload_max_active_sessions_per_user: 3,
    });
  });

  it("clamps a negative number entry to 0", async () => {
    render(<ConfigForm page="vod" />);
    const sessions = await screen.findByLabelText("Max concurrent uploads per user");
    fireEvent.change(sessions, { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.updateInstanceSettings).toHaveBeenCalledTimes(1));
    expect(mocks.updateInstanceSettings).toHaveBeenCalledWith({
      upload_max_active_sessions_per_user: 0,
    });
  });

  it("validates int ranges inline and blocks saving while invalid", async () => {
    render(<ConfigForm page="vod" />);
    const height = await screen.findByLabelText("Import resolution cap");

    fireEvent.change(height, { target: { value: "100" } });
    // Immediate inline validation, before any save attempt.
    expect(await screen.findByText("Must be 0 (no cap) or between 144 and 4320.")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save changes" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(mocks.updateInstanceSettings).not.toHaveBeenCalled();

    // Fixing the value clears the error and saving works again.
    fireEvent.change(height, { target: { value: "720" } });
    await waitFor(() =>
      expect(screen.queryByText("Must be 0 (no cap) or between 144 and 4320.")).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.updateInstanceSettings).toHaveBeenCalledTimes(1));
    expect(mocks.updateInstanceSettings).toHaveBeenCalledWith({ import_max_height: 720 });
  });

  it("saves a single section's changed keys via its Save section button", async () => {
    render(<ConfigForm page="vod" />);
    const sessions = await screen.findByLabelText("Max concurrent uploads per user");
    const height = screen.getByLabelText("Import resolution cap");

    // Dirty two different sections; the Uploads section save patches only its own.
    fireEvent.change(sessions, { target: { value: "7" } });
    fireEvent.change(height, { target: { value: "720" } });
    fireEvent.click(await screen.findByRole("button", { name: "Save Uploads" }));

    await waitFor(() => expect(mocks.updateInstanceSettings).toHaveBeenCalledTimes(1));
    expect(mocks.updateInstanceSettings).toHaveBeenCalledWith({
      upload_max_active_sessions_per_user: 7,
    });
    // The import edit survives the section save as a pending change.
    expect((screen.getByLabelText("Import resolution cap") as HTMLInputElement).value).toBe("720");
    expect(screen.getByText("1 unsaved change")).toBeTruthy();
  });
});

describe("page placement and progressive disclosure", () => {
  it("renders only this page's keys (instance_name is General, not VOD)", async () => {
    render(<ConfigForm page="vod" />);
    await screen.findByLabelText("Max concurrent uploads per user");
    expect(screen.queryByLabelText("Name", { exact: true })).toBeNull();
  });

  it("hides a child setting until its parent toggle is on, then indents it", async () => {
    render(<ConfigForm page="general" />);
    // registration_enabled is off in the doc → the approval child is hidden.
    const parent = await screen.findByRole("switch", { name: "Allow new registrations" });
    expect(
      screen.queryByRole("switch", { name: "Require approval for new accounts" }),
    ).toBeNull();

    fireEvent.click(parent);
    expect(
      await screen.findByRole("switch", { name: "Require approval for new accounts" }),
    ).toBeTruthy();
  });

  it("shows the config default next to the Overridden badge", async () => {
    render(<ConfigForm page="general" />);
    await screen.findByRole("switch", { name: "Allow new registrations" });
    // registration_enabled is overridden (value false, default true).
    expect(screen.getByText("Overridden")).toBeTruthy();
    expect(screen.getByText("Default: on")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeTruthy();
  });

  it("renders an unknown key into the Advanced page's Other settings", async () => {
    mocks.getInstanceSettings.mockResolvedValue({
      settings: [
        ...doc.settings,
        { key: "mystery_knob", type: "bool", value: true, default: false, overridden: false },
      ],
    });
    render(<ConfigForm page="advanced" />);
    expect(await screen.findByRole("switch", { name: "mystery_knob" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Other settings" })).toBeTruthy();
  });

  it("honors server page/section metadata for keys this client has never seen", async () => {
    mocks.getInstanceSettings.mockResolvedValue({
      settings: [
        {
          key: "storyboards_enabled",
          type: "bool",
          value: true,
          default: true,
          overridden: false,
          page: "vod",
          section: "transcoding",
        },
      ],
    });
    render(<ConfigForm page="vod" />);
    expect(await screen.findByRole("switch", { name: "storyboards_enabled" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Transcoding" })).toBeTruthy();
  });

  it("renders an empty state on a page with nothing to configure yet", async () => {
    render(<ConfigForm page="homepage" />);
    expect(await screen.findByText("Nothing to configure here yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("shows the federation boot note when federation is disabled at boot", async () => {
    mocks.getInstanceCached.mockResolvedValue({ federation_enabled: false });
    render(<ConfigForm page="federation" />);
    expect(await screen.findByText(/FEDERATION_ENABLED/)).toBeTruthy();
  });

  it("discard resets every pending edit back to the server truth", async () => {
    render(<ConfigForm page="vod" />);
    const sessions = await screen.findByLabelText("Max concurrent uploads per user");
    fireEvent.change(sessions, { target: { value: "9" } });
    expect(screen.getByText("1 unsaved change")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect((screen.getByLabelText("Max concurrent uploads per user") as HTMLInputElement).value).toBe("5");
    expect(screen.queryByText("1 unsaved change")).toBeNull();
    expect(mocks.updateInstanceSettings).not.toHaveBeenCalled();
  });
});
