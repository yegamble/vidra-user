// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setFollowNotifications = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    setFollowNotifications: (...args: unknown[]) => setFollowNotifications(...args),
  },
}));

import { FollowBell } from "./FollowBell";

const ON = "Notifications on for Grade House";
const OFF = "Notifications off for Grade House";

beforeEach(() => {
  setFollowNotifications.mockImplementation((_handle: string, setting: string) =>
    Promise.resolve({ notification_setting: setting }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FollowBell", () => {
  it("paints from the already-fetched notification_setting without a request", () => {
    render(<FollowBell handle="grade-house" channelName="Grade House" setting="none" />);
    // Seeded, not fetched: core denormalises the field onto the channel and onto
    // every /me/subscriptions row precisely so a list never pays a request a row.
    expect(screen.getByRole("button", { name: OFF })).toBeTruthy();
    expect(setFollowNotifications).not.toHaveBeenCalled();
  });

  it("names both states so the bell is not a mystery glyph", async () => {
    render(<FollowBell handle="grade-house" channelName="Grade House" setting="all" />);
    const bell = screen.getByRole("button", { name: ON });
    expect(bell.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(bell);
    const off = await screen.findByRole("button", { name: OFF });
    expect(off.getAttribute("aria-pressed")).toBe("false");
  });

  it("mutes through PUT /channels/{handle}/follow/notifications and reports the stored mode", async () => {
    const onChange = vi.fn();
    render(
      <FollowBell handle="grade-house" channelName="Grade House" setting="all" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: ON }));
    await waitFor(() =>
      expect(setFollowNotifications).toHaveBeenCalledWith("grade-house", "none"),
    );
    await screen.findByRole("button", { name: OFF });
    expect(onChange).toHaveBeenLastCalledWith("none");
  });

  it("reverts the optimistic flip when the PUT fails", async () => {
    setFollowNotifications.mockRejectedValue(new Error("nope"));
    render(<FollowBell handle="grade-house" channelName="Grade House" setting="all" />);

    fireEvent.click(screen.getByRole("button", { name: ON }));
    await waitFor(() => expect(setFollowNotifications).toHaveBeenCalled());
    // A bell that looked muted while core kept sending every new-video
    // notification would be worse than no control at all.
    await waitFor(() => expect(screen.getByRole("button", { name: ON })).toBeTruthy());
  });

  it("re-seeds when the owner swaps the setting underneath it", async () => {
    const { rerender } = render(
      <FollowBell handle="grade-house" channelName="Grade House" setting="none" />,
    );
    rerender(<FollowBell handle="grade-house" channelName="Grade House" setting="all" />);
    expect(screen.getByRole("button", { name: ON })).toBeTruthy();
  });
});
