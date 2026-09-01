// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const session = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => session.value }));

// Siblings with their own suites — stubbed so this one is about the settings
// index itself (which controls it surfaces, and where it can navigate).
vi.mock("@/components/auth/AccountDataSection", () => ({ AccountDataSection: () => null }));
vi.mock("@/components/auth/ConnectedLogins", () => ({ ConnectedLogins: () => null }));
vi.mock("@/components/auth/BlueskyVisibilityToggle", () => ({
  BlueskyVisibilityToggle: () => null,
}));
vi.mock("@/components/ProfileImageManager", () => ({ ProfileImageManager: () => null }));

const getMessagingPrefs = vi.fn();
const updateMessagingPrefs = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    getMessagingPrefs: (...args: unknown[]) => getMessagingPrefs(...args),
    updateMessagingPrefs: (...args: unknown[]) => updateMessagingPrefs(...args),
  },
  authApi: { requestEmailVerification: vi.fn() },
  ApiError: class ApiError extends Error {},
  errorMessage: () => "Something went wrong.",
  userAvatarUrl: () => null,
  userBannerUrl: () => null,
  // Pulled in by the shared instance-features store behind the messaging gate on
  // ReadReceiptsToggle. Never resolves here: an undisclosed document reads as
  // "messaging available", which is the behaviour these tests assert.
  getInstanceCached: vi.fn(() => new Promise(() => {})),
  invalidateInstanceCache: vi.fn(),
}));

import { SettingsView } from "./SettingsView";

beforeEach(() => {
  getMessagingPrefs.mockResolvedValue({ read_receipts: true });
  updateMessagingPrefs.mockResolvedValue({ read_receipts: false });
  session.value = {
    status: "authed",
    user: {
      id: "u1",
      username: "ada",
      email: "ada@example.test",
      email_verified: true,
      display_name: "Ada",
      bio: "",
      profile_public: true,
    },
    updateProfile: vi.fn(),
    deactivate: vi.fn(),
    deleteAccount: vi.fn(),
    reloadUser: vi.fn(() => Promise.resolve()),
    logout: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsView", () => {
  it("surfaces the read-receipt opt-out on the settings index", async () => {
    render(<SettingsView />);
    const checkbox = (await screen.findByLabelText(
      "Show others when I’ve read their messages",
    )) as HTMLInputElement;
    expect(checkbox.type).toBe("checkbox");
    await waitFor(() => expect(getMessagingPrefs).toHaveBeenCalled());
  });

  it("navigates to the security section without typing a URL", () => {
    render(<SettingsView />);
    const link = screen.getByRole("link", { name: /Manage security settings/ });
    expect(link.getAttribute("href")).toBe("/settings/security");
  });
});
