// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("@/lib/api", () => ({
  getInstanceCached: vi.fn(() => new Promise(() => {})),
  invalidateInstanceCache: vi.fn(),
}));

import { setInstanceFeaturesForTests } from "@/lib/instance-features";

import { InboxTabs } from "./InboxTabs";

function features(overrides: Record<string, unknown> = {}) {
  return { uploads: true, comments: true, ...overrides } as never;
}

afterEach(() => {
  cleanup();
  setInstanceFeaturesForTests(null);
  vi.clearAllMocks();
});

describe("InboxTabs", () => {
  it("is a named segmented group with the active half pressed", () => {
    render(<InboxTabs active="notifications" />);
    const group = screen.getByRole("group", { name: "Inbox sections" });
    expect(group).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Notifications" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "Messages" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("navigates to /messages when the Messages half is chosen from Notifications", () => {
    render(<InboxTabs active="notifications" />);
    fireEvent.click(screen.getByRole("button", { name: "Messages" }));
    expect(push).toHaveBeenCalledWith("/messages");
  });

  it("navigates to /notifications when the Notifications half is chosen from Messages", () => {
    render(<InboxTabs active="messages" />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(push).toHaveBeenCalledWith("/notifications");
  });

  it("does not navigate when the already-active half is re-selected", () => {
    render(<InboxTabs active="messages" />);
    fireEvent.click(screen.getByRole("button", { name: "Messages" }));
    expect(push).not.toHaveBeenCalled();
  });

  // With messaging gated off, the Messages half leads to a surface whose every
  // call 403s. A one-option switcher is not a switcher, so the whole control goes.
  it("is absent entirely when the instance discloses messaging: false", () => {
    setInstanceFeaturesForTests(features({ messaging: false }));
    const { container } = render(<InboxTabs active="notifications" />);
    expect(screen.queryByRole("group", { name: "Inbox sections" })).toBeNull();
    expect(container.textContent).toBe("");
  });

  // Counter-tests: disclosed on, and a core too old to disclose it.
  it("still renders when the instance discloses messaging: true", () => {
    setInstanceFeaturesForTests(features({ messaging: true }));
    render(<InboxTabs active="notifications" />);
    expect(screen.getByRole("group", { name: "Inbox sections" })).toBeTruthy();
  });

  it("still renders when the field is absent (a core that predates it)", () => {
    setInstanceFeaturesForTests(features());
    render(<InboxTabs active="notifications" />);
    expect(screen.getByRole("group", { name: "Inbox sections" })).toBeTruthy();
  });
});
