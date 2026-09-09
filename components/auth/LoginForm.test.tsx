// @vitest-environment jsdom
//
// LoginForm's identifier field: one input accepting an email OR a username,
// shaped into the right request field on submit, plus the identifier-neutral
// error copy.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { routerReplace, routerPush, loginMock, getInstanceMock, resendMock, challengeMock } =
  vi.hoisted(() => ({
    routerReplace: vi.fn(),
    routerPush: vi.fn(),
    loginMock: vi.fn(),
    resendMock: vi.fn(),
    getInstanceMock: vi.fn(),
    challengeMock: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: "anon", login: loginMock, completeMfaChallenge: challengeMock }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { getInstance: getInstanceMock },
    authApi: { resendEmailVerification: resendMock },
  };
});

import { ApiError } from "@/lib/api";

import { LoginForm } from "./LoginForm";

afterEach(() => {
  cleanup();
  loginMock.mockReset();
  getInstanceMock.mockReset();
  routerPush.mockReset();
  routerReplace.mockReset();
  resendMock.mockReset();
  challengeMock.mockReset();
});

// The SSO second factor lands here. The callback issued NO session, parked the
// mfa_token in an httpOnly cookie, and redirected with the FLAG ?mfa=required —
// the page's whole input is that flag, which is exactly the point: a token in
// the URL would sit in history, in same-origin Referer headers and in proxy
// logs, and unlike the step-up assertion an mfa_token is bound to no session.
describe("LoginForm provider two-factor landing", () => {
  it("shows the existing challenge for ?mfa=required and submits with no token", async () => {
    getInstanceMock.mockResolvedValue({ oauth_providers: ["google"], atproto_login: false });
    challengeMock.mockResolvedValue(undefined);
    render(<LoginForm mfaPending />);

    expect(await screen.findByText("Two-factor authentication")).toBeTruthy();
    // The credentials form is gone — this is a sign-in already half-completed,
    // not a fresh one.
    expect(screen.queryByLabelText("Email or username")).toBeNull();
    // The one-shot marker is cleaned out of the URL so a reload cannot replay it.
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/login"));

    fireEvent.click(screen.getByRole("button", { name: "Use a recovery code instead" }));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "a1b2c-3d4e5" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    // NULL token: the server reads the pending cookie the request carries.
    await waitFor(() => expect(challengeMock).toHaveBeenCalledWith(null, "a1b2c-3d4e5"));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/"));
  });

  it("offers a way back to the credentials form", async () => {
    getInstanceMock.mockResolvedValue({ oauth_providers: [], atproto_login: false });
    render(<LoginForm mfaPending />);
    fireEvent.click(await screen.findByRole("button", { name: "Back to sign in" }));
    expect(await screen.findByLabelText("Email or username")).toBeTruthy();
  });
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

  // A05 defect 2 at the sign-in screen: the refusal that holds an unverified
  // account is the same refusal that denies it the session the signed-in resend
  // needs, so the copy alone ("check your inbox") pointed at a message the
  // person no longer has and offered nothing.
  it("offers the resend when an email sign-in is held for verification", async () => {
    resendMock.mockResolvedValue(undefined);
    loginMock.mockRejectedValue(
      new ApiError({
        status: 403,
        code: "email_verification_required",
        message: "verify your email address to sign in",
      }),
    );
    await signIn("ada@example.test");
    await screen.findByText(/Verify your email address first/);

    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
    await waitFor(() => expect(resendMock).toHaveBeenCalledWith({ email: "ada@example.test" }));
  });

  it("does NOT offer the resend when the attempt used a username", async () => {
    loginMock.mockRejectedValue(
      new ApiError({
        status: 403,
        code: "email_verification_required",
        message: "verify your email address to sign in",
      }),
    );
    await signIn("ada");
    await screen.findByText(/Verify your email address first/);
    // The route takes an ADDRESS. This browser has a username and no way to
    // turn it into one, and inventing a lookup would be the enumeration
    // oracle the resend route was written to avoid.
    expect(screen.queryByRole("button", { name: "Resend verification email" })).toBeNull();
  });

  it("still swaps to the MFA challenge from a username sign-in", async () => {
    loginMock.mockResolvedValue({ status: "mfa_required", mfaToken: "mfa-token" });
    await signIn("ada");
    await screen.findByText("Two-factor authentication");
    expect(routerPush).not.toHaveBeenCalled();
  });
});

// The sign-in screen names the INSTANCE, not the software running it. The tab
// title and the app header have always shown the operator's name; the auth
// screens were pinned to the product wordmark, so a renamed instance still read
// "Sign in to Vidra". The product mark survives as the small "Powered by"
// line rendered by AuthPage.
describe("LoginForm branding", () => {
  it("names the instance in the heading and the home wordmark", async () => {
    getInstanceMock.mockResolvedValue({ oauth_providers: [], atproto_login: false });
    render(<LoginForm instanceName="A17 Lab Tube" />);
    await screen.findByLabelText("Email or username");
    expect(screen.getByText("Sign in to A17 Lab Tube")).toBeTruthy();
    expect(screen.getByRole("link", { name: "A17 Lab Tube" }).getAttribute("href")).toBe("/");
    expect(screen.queryByText("Sign in to Vidra")).toBeNull();
  });

  it("falls back to the product name when the instance has none", async () => {
    getInstanceMock.mockResolvedValue({ oauth_providers: [], atproto_login: false });
    // Undefined is what a build-time prerender sees: there is no backend to ask.
    render(<LoginForm />);
    await screen.findByLabelText("Email or username");
    expect(screen.getByText("Sign in to Vidra")).toBeTruthy();
  });

  it("treats a whitespace-only instance name as no name", async () => {
    getInstanceMock.mockResolvedValue({ oauth_providers: [], atproto_login: false });
    render(<LoginForm instanceName="   " />);
    await screen.findByLabelText("Email or username");
    expect(screen.getByText("Sign in to Vidra")).toBeTruthy();
  });
});
