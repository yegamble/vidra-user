// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstanceSettings: vi.fn(),
  updateInstanceSettings: vi.fn(),
  getInstance: vi.fn(),
  getInstanceDocument: vi.fn(),
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
      getInstance: mocks.getInstance,
      getInstanceDocument: mocks.getInstanceDocument,
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
  mocks.getInstanceDocument.mockImplementation((name: string) =>
    Promise.resolve({ name, body: "", hash: "" }),
  );
  mocks.updateInstanceSettings.mockResolvedValue(doc);
  mocks.getInstance.mockResolvedValue({ name: "Test", federation_enabled: true });
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

describe("broadcast section (General page, config-parity W3)", () => {
  const broadcastDoc = {
    settings: [
      ...doc.settings,
      { key: "broadcast_enabled", type: "bool", value: false, default: false, overridden: false },
      { key: "broadcast_message", type: "string", value: "", default: "", overridden: false },
      {
        key: "broadcast_level",
        type: "enum",
        value: "info",
        default: "info",
        overridden: false,
        options: ["info", "warning", "error"],
      },
      { key: "broadcast_dismissable", type: "bool", value: false, default: false, overridden: false },
    ],
  };

  beforeEach(() => {
    mocks.getInstanceSettings.mockResolvedValue(broadcastDoc);
    mocks.updateInstanceSettings.mockResolvedValue(broadcastDoc);
  });

  it("discloses message, level, and dismissable only once the master toggle is on", async () => {
    render(<ConfigForm page="general" />);
    const master = await screen.findByRole("switch", {
      name: "Display a message on every page",
    });
    // Children hidden while broadcast_enabled is off…
    expect(screen.queryByLabelText("Message", { exact: true })).toBeNull();
    expect(screen.queryByRole("group", { name: "Style" })).toBeNull();
    expect(
      screen.queryByRole("switch", { name: "Viewers can dismiss the message" }),
    ).toBeNull();

    // …and appear (message textarea, level picker, dismissable toggle) once on.
    fireEvent.click(master);
    expect(await screen.findByLabelText("Message", { exact: true })).toBeTruthy();
    const style = screen.getByRole("group", { name: "Style" });
    expect(style.querySelectorAll("button").length).toBe(3);
    expect(
      screen.getByRole("button", { name: "Info" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("switch", { name: "Viewers can dismiss the message" }),
    ).toBeTruthy();
  });

  it("saves the broadcast slice as one patch: bool + markdown string + level enum", async () => {
    render(<ConfigForm page="general" />);
    fireEvent.click(
      await screen.findByRole("switch", { name: "Display a message on every page" }),
    );
    fireEvent.change(await screen.findByLabelText("Message", { exact: true }), {
      target: { value: "Maintenance **tonight**." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Warning" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateInstanceSettings).toHaveBeenCalledTimes(1));
    expect(mocks.updateInstanceSettings).toHaveBeenCalledWith({
      broadcast_enabled: true,
      broadcast_message: "Maintenance **tonight**.",
      broadcast_level: "warning",
    });
  });

  it("previews the broadcast message through the shared markdown modal", async () => {
    render(<ConfigForm page="general" />);
    fireEvent.click(
      await screen.findByRole("switch", { name: "Display a message on every page" }),
    );
    fireEvent.change(await screen.findByLabelText("Message", { exact: true }), {
      target: { value: "## Heads up\n\nBe **ready**." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview Message" }));
    expect(await screen.findByRole("heading", { name: "Heads up", level: 2 })).toBeTruthy();
    expect(screen.getByText("ready").tagName).toBe("STRONG");
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
    // Federation has no registry keys in this fixture (and no panel section).
    render(<ConfigForm page="federation" />);
    expect(await screen.findByText("Nothing to configure here yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("the homepage page hosts the W6 document editor panel, not registry rows", async () => {
    render(<ConfigForm page="homepage" />);
    expect(await screen.findByRole("group", { name: "Homepage content editor" })).toBeTruthy();
    expect(screen.getByLabelText("Homepage content")).toBeTruthy();
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

describe("branding panel reachability (General page, config-parity W4)", () => {
  // The real backend's placement rows for the W4 registry keys (vidra-core
  // instancesettings registry: customization/header and general/social) —
  // NOT the META fallback path. The review-caught regression: the panel must
  // not depend on a registry key landing in general/branding.
  const w4Settings = {
    settings: [
      ...doc.settings,
      {
        key: "header_hide_instance_name",
        type: "bool",
        value: false,
        default: false,
        overridden: false,
        page: "customization",
        section: "header",
      },
      {
        key: "social_meta_twitter_username",
        type: "string",
        value: "",
        default: "",
        overridden: false,
        page: "general",
        section: "social",
      },
    ],
  };

  it("renders the Branding assets panel on General even though the server homes the hide-name toggle at customization/header", async () => {
    mocks.getInstanceSettings.mockResolvedValue(w4Settings);
    const unset = { url: "", is_fallback: true };
    mocks.getInstance.mockResolvedValue({
      name: "Test",
      federation_enabled: true,
      branding: {
        avatar: unset,
        banner: unset,
        logos: { favicon: unset, header_wide: unset, header_square: unset, opengraph: unset },
        hide_instance_name: false,
      },
    });
    render(<ConfigForm page="general" />);

    expect(await screen.findByRole("group", { name: "Branding assets" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Branding" })).toBeTruthy();
    // The server-placed toggle does NOT render here…
    expect(
      screen.queryByRole("switch", { name: "Hide the instance name in the header" }),
    ).toBeNull();
    // …but the social handle (server-placed general/social) does.
    expect(screen.getByLabelText("X (Twitter) username for link cards")).toBeTruthy();
  });

  it("renders the hide-name toggle on Customization under the Header section", async () => {
    mocks.getInstanceSettings.mockResolvedValue(w4Settings);
    render(<ConfigForm page="customization" />);

    const toggle = await screen.findByRole("switch", {
      name: "Hide the instance name in the header",
    });
    expect(toggle).toBeTruthy();
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("heading", { name: "Header" })).toBeTruthy();
    // The branding assets panel lives on General, not here.
    expect(screen.queryByRole("group", { name: "Branding assets" })).toBeNull();
  });

  it("keeps the Branding section (with the honest pre-W1 note) when the backend returns no W4 keys and no branding block", async () => {
    render(<ConfigForm page="general" />);
    await screen.findByRole("heading", { name: "Branding" });
    expect(
      await screen.findByText("Instance branding is not supported by this server yet."),
    ).toBeTruthy();
  });
});
