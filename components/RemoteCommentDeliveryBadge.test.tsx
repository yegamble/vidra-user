// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RemoteCommentDeliveryBadge } from "./RemoteCommentDeliveryBadge";

afterEach(cleanup);

describe("RemoteCommentDeliveryBadge", () => {
  it("labels the three delivery states with an accessible name", () => {
    const { rerender } = render(<RemoteCommentDeliveryBadge state="pending" />);
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Delivery to origin: Pending" })).toBeTruthy();

    rerender(<RemoteCommentDeliveryBadge state="delivered" />);
    expect(screen.getByText("Delivered")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Delivery to origin: Delivered" })).toBeTruthy();

    rerender(<RemoteCommentDeliveryBadge state="failed" />);
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Delivery to origin: Failed" })).toBeTruthy();
  });

  it("surfaces last_error as the failed badge's tooltip, over the generic text", () => {
    render(<RemoteCommentDeliveryBadge state="failed" lastError="destination instance is blocked" />);
    const badge = screen.getByRole("status");
    expect(badge.getAttribute("title")).toBe("destination instance is blocked");
  });

  it("falls back to a generic explanation when a failed badge carries no error", () => {
    render(<RemoteCommentDeliveryBadge state="failed" />);
    const badge = screen.getByRole("status");
    expect(badge.getAttribute("title")).toMatch(/still hosted and shown here/);
  });

  it("ignores last_error for non-failed states (it is only set on failure)", () => {
    render(<RemoteCommentDeliveryBadge state="delivered" lastError="stale" />);
    const badge = screen.getByRole("status");
    expect(badge.getAttribute("title")).toBe("Delivered to the origin instance.");
  });
});
