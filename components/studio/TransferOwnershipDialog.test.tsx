// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { giveVideoOwnership, cancelVideoOwnership } = vi.hoisted(() => ({
  giveVideoOwnership: vi.fn(),
  cancelVideoOwnership: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, giveVideoOwnership, cancelVideoOwnership } };
});

import { ApiError } from "@/lib/api";

import { TransferOwnershipDialog } from "./TransferOwnershipDialog";

afterEach(cleanup);
// A braced body: a hook that RETURNS a function registers it as teardown, and
// mockReset returns the mock itself.
beforeEach(() => {
  giveVideoOwnership.mockReset();
  cancelVideoOwnership.mockReset();
});

function open(onClose = vi.fn()) {
  render(<TransferOwnershipDialog videoId="v1" videoTitle="Gift Clip" onClose={onClose} />);
  return onClose;
}

function enter(username: string) {
  fireEvent.change(screen.getByLabelText("Recipient's username"), { target: { value: username } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("TransferOwnershipDialog", () => {
  it("confirms that the recipient must accept before it sends the request", async () => {
    giveVideoOwnership.mockResolvedValue(undefined);
    const onClose = open();

    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
    enter(" @bob ");
    expect(screen.getByText(/Offer “Gift Clip” to @bob\?/)).toBeTruthy();
    expect(screen.getByText(/Nothing changes until they accept/)).toBeTruthy();
    expect(giveVideoOwnership).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(giveVideoOwnership).toHaveBeenCalledWith("v1", "bob"));
    expect(await screen.findByText(/Request sent/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("says plainly when no one can receive the video under that name, and lets you fix it", async () => {
    giveVideoOwnership.mockRejectedValue(
      new ApiError({ status: 404, code: "not_found", message: "user not found" }),
    );
    open();
    enter("nobody");
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByText(/No one on this instance can receive videos as @nobody/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByLabelText("Recipient's username") as HTMLInputElement).value).toBe("nobody");
  });

  it("shows the server's reason for a conflict", async () => {
    giveVideoOwnership.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "conflict",
        message: "an ownership change for this video is already pending",
      }),
    );
    open();
    enter("bob");
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByText(/already pending/)).toBeTruthy();
    expect(screen.queryByText(/Request sent/)).toBeNull();
  });
});

describe("TransferOwnershipDialog — withdrawing", () => {
  it("withdraws the offer it just sent", async () => {
    giveVideoOwnership.mockResolvedValue(undefined);
    cancelVideoOwnership.mockResolvedValue(undefined);
    open();
    enter("bob");
    expect(screen.getByText(/can withdraw the offer while it is pending/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw offer" }));
    await waitFor(() => expect(cancelVideoOwnership).toHaveBeenCalledWith("v1"));
    expect(await screen.findByText(/Offer withdrawn/)).toBeTruthy();
  });

  it("withdraws an older pending offer that blocks a new one", async () => {
    giveVideoOwnership.mockRejectedValueOnce(
      new ApiError({ status: 409, code: "conflict", message: "an ownership change for this video is already pending" }),
    );
    cancelVideoOwnership.mockResolvedValue(undefined);
    open();
    enter("bob");
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw the pending offer" }));
    await waitFor(() => expect(cancelVideoOwnership).toHaveBeenCalledWith("v1"));
    // Back on the form, free to offer it again.
    expect(await screen.findByText(/pending offer was withdrawn/)).toBeTruthy();
    expect(screen.getByLabelText("Recipient's username")).toBeTruthy();
  });
});
