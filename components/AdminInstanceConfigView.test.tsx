// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstanceSettings: vi.fn(),
  updateInstanceSettings: vi.fn(),
  getVideoConfigCached: vi.fn(),
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
  ],
};

beforeEach(() => {
  mocks.getInstanceSettings.mockResolvedValue(doc);
  mocks.updateInstanceSettings.mockResolvedValue(doc);
  mocks.getVideoConfigCached.mockResolvedValue({ languages: [], categories: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminInstanceConfigView limits", () => {
  it("renders int limit rows as number inputs, a bytes hint, and PATCHes a JSON number", async () => {
    render(<ConfigForm />);

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
    render(<ConfigForm />);
    const sessions = await screen.findByLabelText("Max concurrent uploads per user");
    fireEvent.change(sessions, { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.updateInstanceSettings).toHaveBeenCalledTimes(1));
    expect(mocks.updateInstanceSettings).toHaveBeenCalledWith({
      upload_max_active_sessions_per_user: 0,
    });
  });
});
