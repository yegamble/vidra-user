// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const confirmEmailChange = vi.fn();
const reloadUser = vi.fn();
let sessionStatus = "authed";

vi.mock("@/lib/api", () => ({
  authApi: { confirmEmailChange: (...args: unknown[]) => confirmEmailChange(...args) },
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(args: { status: number; code: string; message: string }) {
      super(args.message);
      this.status = args.status;
      this.code = args.code;
    }
  },
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus, reloadUser }),
}));

import { ApiError } from "@/lib/api";

import { ConfirmEmailChangeForm } from "./ConfirmEmailChangeForm";

beforeEach(() => {
  sessionStatus = "authed";
  confirmEmailChange.mockResolvedValue({ email: "ada.new@example.test" });
  reloadUser.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConfirmEmailChangeForm", () => {
  it("submits the token from the link and states the new address", async () => {
    render(<ConfirmEmailChangeForm token="token-fixture-1" />);
    await waitFor(() =>
      expect(confirmEmailChange).toHaveBeenCalledWith({ token: "token-fixture-1" }),
    );
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/ada\.new@example\.test/);
    // The account is re-read so the settings UI stops showing the old address.
    await waitFor(() => expect(reloadUser).toHaveBeenCalled());
  });

  it("never spends the token while the session is still restoring", async () => {
    sessionStatus = "restoring";
    render(<ConfirmEmailChangeForm token="token-fixture-1" />);
    // A single-use token submitted without a bearer token would be gone for good.
    await new Promise((r) => setTimeout(r, 20));
    expect(confirmEmailChange).not.toHaveBeenCalled();
  });

  it("asks a signed-out reader to sign in instead of spending the token", async () => {
    sessionStatus = "anon";
    render(<ConfirmEmailChangeForm token="token-fixture-1" />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/sign in/i);
    expect(confirmEmailChange).not.toHaveBeenCalled();
  });

  it("reports an invalid, used or expired link without claiming success", async () => {
    confirmEmailChange.mockRejectedValue(
      new ApiError({ status: 400, code: "err", message: "invalid or expired email change token" }),
    );
    render(<ConfirmEmailChangeForm token="token-fixture-1" />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/invalid, already used, or has expired/i);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("treats a link with no token as invalid rather than calling the API", async () => {
    render(<ConfirmEmailChangeForm token="" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid/i);
    expect(confirmEmailChange).not.toHaveBeenCalled();
  });
});
