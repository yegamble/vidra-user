// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: "authed" }),
}));

const listFollowedChannels = vi.fn();
const setFollowNotifications = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    listFollowedChannels: (...args: unknown[]) => listFollowedChannels(...args),
    setFollowNotifications: (...args: unknown[]) => setFollowNotifications(...args),
  },
  channelAvatarUrl: (handle: string) => `/avatar/${handle}`,
}));

import { SidebarFollowing } from "./SidebarFollowing";

// Only the fields this rail reads; the bell state rides on the row itself.
function row(id: string, handle: string, name: string, setting: "all" | "none") {
  return { id, handle, display_name: name, has_avatar: false, notification_setting: setting };
}

beforeEach(() => {
  // Atlas Lab is the control row: muting Grade House must not disturb it, and
  // its own seeded "none" proves the list is not painting one hardcoded state.
  listFollowedChannels.mockResolvedValue({
    channels: [row("c1", "grade-house", "Grade House", "all"), row("c2", "atlas-lab", "Atlas Lab", "none")],
    limit: 15,
    offset: 0,
  });
  setFollowNotifications.mockImplementation((_handle: string, setting: string) =>
    Promise.resolve({ notification_setting: setting }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SidebarFollowing bells", () => {
  it("seeds every row's bell from the row itself — one list request, no per-row fetch", async () => {
    render(<SidebarFollowing collapsed={false} />);

    await screen.findByRole("button", { name: "Notifications on for Grade House" });
    expect(screen.getByRole("button", { name: "Notifications off for Atlas Lab" })).toBeTruthy();
    expect(listFollowedChannels).toHaveBeenCalledTimes(1);
    expect(setFollowNotifications).not.toHaveBeenCalled();
  });

  it("mutes one channel without dropping it — or its neighbour — from the list", async () => {
    render(<SidebarFollowing collapsed={false} />);
    const bell = await screen.findByRole("button", {
      name: "Notifications on for Grade House",
    });

    fireEvent.click(bell);
    await waitFor(() =>
      expect(setFollowNotifications).toHaveBeenCalledWith("grade-house", "none"),
    );

    // Muting is not unfollowing: the subscription — and the untouched control
    // row beside it — must survive the toggle.
    await screen.findByRole("button", { name: "Notifications off for Grade House" });
    expect(screen.getByRole("link", { name: /Grade House/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Atlas Lab/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Notifications off for Atlas Lab" })).toBeTruthy();
    expect(listFollowedChannels).toHaveBeenCalledTimes(1);
  });

  it("keeps the collapsed rail a pure navigation rail", async () => {
    render(<SidebarFollowing collapsed={true} />);
    await screen.findByRole("link", { name: /Grade House/ });
    expect(screen.queryByRole("button", { name: /Notifications/ })).toBeNull();
  });
});
