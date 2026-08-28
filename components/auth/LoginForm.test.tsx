// @vitest-environment jsdom
//
// LoginForm's identifier field: one input accepting an email OR a username,
// shaped into the right request field on submit, plus the identifier-neutral
// error copy.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { routerReplace, routerPush, loginMock, getInstanceMock } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
  loginMock: vi.fn(),
  getInstanceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: "anon", login: loginMock, completeMfaChallenge: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { getInstance: getInstanceMock } };
});

import { ApiError } from "@/lib/api";

import { LoginForm } from "./LoginForm";

afterEach(() => {
  cleanup();
  loginMock.mockReset();
  getInstanceMock.mockReset();
  routerPush.mockReset();
  routerReplace.mockReset();
});

async function signIn(identifier: string, password = "supersecret") {
  getInstanceMock.mockResolvedValue({ oauth_providers: [], atproto_login: false });
  render(<LoginForm />);
  const field = await screen.findByLabelText("Email or username");
  fireEvent.change(field, { target: { value: identifier } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  return field;
}

describe("LoginForm identifier field", () => {
  it("is a text input labelled for both identifiers", async () => {
    getInstanceMock.mockResolvedValue({ oauth_providers: [], atproto_login: false });
    render(<LoginForm />);
    const field = await screen.findByLabelText("Email or username");
    // type="email" would have the browser refuse a valid username before the
    // request was ever made; autoComplete="username" is the token password
    // managers pair with current-password.
    expect(field.getAttribute("type")).toBe("text");
    expect(field.getAttribute("autocomplete")).toBe("username");
  });

  it("sends email-shaped input as `email` (works against a pre-identifier backend)", async () => {
    loginMock.mockResolvedValue({ status: "authed" });
    await signIn("ada@example.test");
    await waitFor(() => expect(loginMock).toHaveBeenCalled());
    expect(loginMock.mock.calls[0][0]).toEqual({
      email: "ada@example.test",
      password: "supersecret",
    });
    expect(routerPush).toHaveBeenCalledWith("/");
  });

  it("sends a username as `identifier`", async () => {
    loginMock.mockResolvedValue({ status: "authed" });
    await signIn("ada");
    await waitFor(() => expect(loginMock).toHaveBeenCalled());
    expect(loginMock.mock.calls[0][0]).toEqual({ identifier: "ada", password: "supersecret" });
  });

  it("shows identifier-neutral copy on a 401", async () => {
    loginMock.mockRejectedValue(
      new ApiError({ status: 401, code: "unauthorized", message: "invalid credentials" }),
    );
    await signIn("ada");
    await screen.findByText("Invalid email/username or password.");
  });

  it("still swaps to the MFA challenge from a username sign-in", async () => {
    loginMock.mockResolvedValue({ status: "mfa_required", mfaToken: "mfa-token" });
    await signIn("ada");
    await screen.findByText("Two-factor authentication");
    expect(routerPush).not.toHaveBeenCalled();
  });
});
