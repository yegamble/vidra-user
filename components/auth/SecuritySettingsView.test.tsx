// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logoutEverywhere = vi.fn();
const session = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => session.value }));

const getMFAStatus = vi.fn();
vi.mock("@/lib/api", () => ({
  authApi: {
    getMFAStatus: (...args: unknown[]) => getMFAStatus(...args),
    beginTOTPEnrollment: vi.fn(),
    verifyTOTPEnrollment: vi.fn(),
    disableTOTP: vi.fn(),
    // The Email card mounts alongside the two-factor one and reads its pending
    // state on mount. Stubbed as "nothing pending" so this view's own
    // assertions are unaffected by it.
    getEmailChange: vi.fn(async () => ({ pending: false })),
    requestEmailChange: vi.fn(),
    resendEmailChange: vi.fn(),
    cancelEmailChange: vi.fn(),
    changePassword: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
  errorMessage: () => "Something went wrong.",
}));

import { SecuritySettingsView } from "./SecuritySettingsView";

const ARM = "Sign out of all devices";
const CONFIRM = "Yes, sign me out everywhere";

beforeEach(() => {
  getMFAStatus.mockResolvedValue({ enabled: false, recovery_codes_remaining: 0 });
  logoutEverywhere.mockResolvedValue(undefined);
  session.value = { status: "authed", logoutEverywhere };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SecuritySettingsView", () => {
  it("offers signing out of all devices behind a confirmation", async () => {
    render(<SecuritySettingsView />);
    const arm = await screen.findByRole("button", { name: ARM });

    // Arming alone must not revoke anything.
    fireEvent.click(arm);
    expect(logoutEverywhere).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: CONFIRM }));
    await waitFor(() => expect(logoutEverywhere).toHaveBeenCalledTimes(1));
  });

  it("cancels back to the un-armed state without revoking", async () => {
    render(<SecuritySettingsView />);
    fireEvent.click(await screen.findByRole("button", { name: ARM }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: CONFIRM })).toBeNull();
    expect(screen.getByRole("button", { name: ARM })).toBeTruthy();
    expect(logoutEverywhere).not.toHaveBeenCalled();
  });

  it("surfaces a failed revoke instead of implying the devices are signed out", async () => {
    logoutEverywhere.mockRejectedValue(new Error("nope"));
    render(<SecuritySettingsView />);
    fireEvent.click(await screen.findByRole("button", { name: ARM }));
    fireEvent.click(screen.getByRole("button", { name: CONFIRM }));

    await waitFor(() =>
      expect(screen.getAllByRole("alert").some((n) => n.textContent?.includes("wrong"))).toBe(
        true,
      ),
    );
  });

  it("does not offer the control to a signed-out visitor", () => {
    session.value = { status: "anon", logoutEverywhere };
    render(<SecuritySettingsView />);
    expect(screen.queryByRole("button", { name: ARM })).toBeNull();
  });
});
