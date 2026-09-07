// @vitest-environment jsdom
//
// ResendVerification: the way out of the dead end A05 measured. With the
// verification gate on, registration issues no session and login answers 403
// email_verification_required, so the account that lost its message had no
// bearer token to ask for another with — and the only resend that shipped sat
// behind requireAuth.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { resendMock } = vi.hoisted(() => ({ resendMock: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, authApi: { resendEmailVerification: resendMock } };
});

import { ApiError } from "@/lib/api";

import { ResendVerification } from "./ResendVerification";

afterEach(() => {
  cleanup();
  resendMock.mockReset();
});

describe("ResendVerification", () => {
  it("sends the address and confirms without claiming the account exists", async () => {
    resendMock.mockResolvedValue(undefined);
    render(<ResendVerification email="ada@example.test" />);

    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));

    await waitFor(() => expect(resendMock).toHaveBeenCalledWith({ email: "ada@example.test" }));
    const sent = await screen.findByTestId("resend-verification-sent");
    // The backend answers the SAME 202 for a known address, an unknown one and
    // an already-verified one, so the copy must stay conditional: "we sent you
    // a link" would leak what the route was written not to disclose.
    expect(sent.textContent).toMatch(/if that address has an unconfirmed account/i);
    expect(sent.textContent).not.toMatch(/we sent you/i);
  });

  it("names the rate limit rather than reporting a generic failure", async () => {
    resendMock.mockRejectedValue(new ApiError({ status: 429, code: "rate_limited", message: "rate limited" }));
    render(<ResendVerification email="ada@example.test" />);

    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/wait a minute/i);
    // The button comes back: a permanently disabled control is a dead end.
    expect(screen.getByRole("button", { name: "Resend verification email" })).toBeTruthy();
  });

  it("recovers from a transient failure and lets the person try again", async () => {
    resendMock.mockRejectedValueOnce(new ApiError({ status: 500, code: "internal", message: "boom" })).mockResolvedValueOnce(undefined);
    render(<ResendVerification email="ada@example.test" />);

    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
    expect(await screen.findByTestId("resend-verification-sent")).toBeTruthy();
  });
});
