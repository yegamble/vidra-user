// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { InboxTabs } from "./InboxTabs";

afterEach(() => {
  cleanup();
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
});
