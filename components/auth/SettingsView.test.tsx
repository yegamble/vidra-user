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
import { SETTINGS_GROUPS } from "@/components/settings/sections";

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

  // The phone surface of the section nav. Below `lg` the SettingsRail is
  // hidden, so these grouped rows are the ONLY settings navigation a
  // phone-bound viewer has — and until now nothing pinned how they are drawn.
  // They used to lead with the colored `IconTile` square; the rail's own suite
  // cannot catch a regression here because it renders a different component.
  it("leads each grouped row with a plain icon, never a colored tile", () => {
    const { container } = render(<SettingsView />);
    const rows = Array.from(container.querySelectorAll("a[href^='/settings/']"));
    expect(rows.length).toBe(SETTINGS_GROUPS.flatMap((g) => g.items).length);
    // No tile anywhere: the square was a `bg-tile-*` box holding a white glyph.
    expect(container.querySelectorAll('[class*="bg-tile-"]')).toHaveLength(0);
    for (const row of rows) {
      // Leading glyph + trailing chevron, both at the app's 18px list size.
      const svgs = Array.from(row.querySelectorAll("svg"));
      expect(svgs).toHaveLength(2);
      for (const svg of svgs) {
        expect(svg.getAttribute("width")).toBe("18");
        expect(svg.getAttribute("height")).toBe("18");
      }
      // The leading icon is muted, and is the link's own child — not boxed.
      expect(svgs[0].getAttribute("class")).toContain("text-fg-muted");
      expect(svgs[0].parentElement).toBe(row);
    }
  });
});
