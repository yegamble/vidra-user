// @vitest-environment jsdom
//
// The first-run signpost: it appears only on the evidence of the instance
// document (server snapshot or the live browser read), and it is never
// dismissable.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getInstanceCachedMock } = vi.hoisted(() => ({ getInstanceCachedMock: vi.fn() }));

vi.mock("@/lib/api/instance-platform", () => ({
  getInstanceCached: getInstanceCachedMock,
}));

import { OwnerClaimCard } from "./OwnerClaimCard";

afterEach(() => {
  cleanup();
  getInstanceCachedMock.mockReset();
});

/** The live read agrees with whatever the snapshot said. */
function liveInstance(pending: boolean) {
  getInstanceCachedMock.mockResolvedValue({ owner_claim_pending: pending });
}

describe("OwnerClaimCard", () => {
  it("points an unclaimed server at the wizard", async () => {
    liveInstance(true);
    render(<OwnerClaimCard instance={{ owner_claim_pending: true }} />);
    expect(screen.getByText("This server is waiting for its owner")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "Finish setup" });
    expect(cta.getAttribute("href")).toBe("/setup/claim");
  });

  it("offers no way to dismiss it — the task is the point", async () => {
    liveInstance(true);
    render(<OwnerClaimCard instance={{ owner_claim_pending: true }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    ["a claimed server", { owner_claim_pending: false }],
    ["an unreadable instance document", null],
    ["a backend that predates the field", {}],
  ])("renders nothing for %s", async (_label, instance) => {
    liveInstance(false);
    const { container } = render(<OwnerClaimCard instance={instance} />);
    await waitFor(() => expect(getInstanceCachedMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("appears from the live read when the server snapshot could not be taken", async () => {
    // A deployment coming up for the first time: the render-time read failed,
    // but the browser reaches the API a moment later.
    liveInstance(true);
    render(<OwnerClaimCard instance={null} />);
    expect(await screen.findByText("This server is waiting for its owner")).toBeTruthy();
  });

  it("retires itself when the live read says the server has an owner", async () => {
    liveInstance(false);
    const { container } = render(<OwnerClaimCard instance={{ owner_claim_pending: true }} />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("keeps the snapshot's answer when the live read fails", async () => {
    getInstanceCachedMock.mockRejectedValue(new Error("offline"));
    render(<OwnerClaimCard instance={{ owner_claim_pending: true }} />);
    await waitFor(() => expect(getInstanceCachedMock).toHaveBeenCalled());
    expect(screen.getByText("This server is waiting for its owner")).toBeTruthy();
  });
});
