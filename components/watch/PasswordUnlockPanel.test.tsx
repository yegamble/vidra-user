// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PasswordUnlockPanel } from "./PasswordUnlockPanel";
import { ApiError, api } from "@/lib/api";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe("PasswordUnlockPanel", () => {
  it("unlocks with the entered password and hands the minted token up", async () => {
    const unlock = vi
      .spyOn(api, "unlockVideo")
      .mockResolvedValue({ playback_token: "pt-xyz", expires_in: 21600 });
    const onUnlocked = vi.fn();
    render(<PasswordUnlockPanel videoId="v1" onUnlocked={onUnlocked} />);

    fireEvent.change(screen.getByLabelText("Video password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledWith("pt-xyz"));
    expect(unlock).toHaveBeenCalledWith("v1", "hunter2");
  });

  it("shows an inline error and does not unlock on a wrong password (401)", async () => {
    vi.spyOn(api, "unlockVideo").mockRejectedValue(
      new ApiError({ status: 401, code: "unauthorized", message: "wrong" }),
    );
    const onUnlocked = vi.fn();
    render(<PasswordUnlockPanel videoId="v1" onUnlocked={onUnlocked} />);

    fireEvent.change(screen.getByLabelText("Video password"), { target: { value: "nope123" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("That password is incorrect.");
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it("shows a rate-limit message on 429", async () => {
    vi.spyOn(api, "unlockVideo").mockRejectedValue(
      new ApiError({ status: 429, code: "rate_limited", message: "slow down" }),
    );
    render(<PasswordUnlockPanel videoId="v1" onUnlocked={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Video password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Too many attempts/);
  });

  it("does not submit an empty password", () => {
    const unlock = vi.spyOn(api, "unlockVideo");
    render(<PasswordUnlockPanel videoId="v1" onUnlocked={vi.fn()} />);
    // The Unlock button is disabled while the field is empty.
    expect((screen.getByRole("button", { name: "Unlock" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(unlock).not.toHaveBeenCalled();
  });
});
