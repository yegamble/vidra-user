// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listDevices = vi.fn();
const forgetDevice = vi.fn();
const updateSecurityPrefs = vi.fn();
vi.mock("@/lib/api", () => ({
  authApi: {
    listDevices: (...a: unknown[]) => listDevices(...a),
    forgetDevice: (...a: unknown[]) => forgetDevice(...a),
    updateSecurityPrefs: (...a: unknown[]) => updateSecurityPrefs(...a),
  },
  errorMessage: () => "Something went wrong.",
}));

import { RecognisedDevicesSection } from "./RecognisedDevicesSection";

const devices = [
  { id: "d1", label: "Chrome on macOS", first_seen_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-10-12T00:00:00Z", current: true },
  { id: "d2", label: "Firefox on Windows", first_seen_at: "2026-10-02T00:00:00Z", last_seen_at: "2026-10-10T00:00:00Z", current: false },
];

beforeEach(() => {
  listDevices.mockResolvedValue({ devices, new_device_email: true });
  forgetDevice.mockResolvedValue(undefined);
  updateSecurityPrefs.mockResolvedValue({ new_device_email: false });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecognisedDevicesSection", () => {
  it("lists devices, marks the current one, and forgets another", async () => {
    render(<RecognisedDevicesSection />);
    await screen.findByText("Firefox on Windows");
    expect(screen.getByText("This device")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Forget device Firefox on Windows" }));
    await waitFor(() => expect(forgetDevice).toHaveBeenCalledWith("d2"));
    await waitFor(() => expect(screen.queryByText("Firefox on Windows")).toBeNull());
    expect(screen.getByText("Chrome on macOS")).toBeTruthy();
  });

  it("toggles the new-device email and rolls back on failure", async () => {
    render(<RecognisedDevicesSection />);
    const box = (await screen.findByLabelText(/Email me when my account is signed in/)) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(updateSecurityPrefs).toHaveBeenCalledWith({ new_device_email: false }));
    expect(box.checked).toBe(false);

    updateSecurityPrefs.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(box);
    await screen.findByText("Something went wrong.");
    expect(box.checked).toBe(false);
  });

  it("says so when the list cannot be loaded, without a dead switch", async () => {
    listDevices.mockRejectedValue(new Error("down"));
    render(<RecognisedDevicesSection />);
    await screen.findByText(/could not be loaded/);
    expect((screen.getByLabelText(/Email me when/) as HTMLInputElement).disabled).toBe(true);
  });
});
