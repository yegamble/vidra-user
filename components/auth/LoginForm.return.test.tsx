// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: "anon" as "anon" | "authed" | "restoring",
  router: { push: vi.fn(), replace: vi.fn() },
  login: vi.fn(), challenge: vi.fn(), instance: vi.fn(), bluesky: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: mocks.status, login: mocks.login, completeMfaChallenge: mocks.challenge }),
}));
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: { getInstance: mocks.instance }, beginATProtoLogin: mocks.bluesky,
}));
import { LoginForm } from "./LoginForm";

const destination = "/videos/v1?playlist=p1&t=32#comments";
const loginPath = `/login?return_to=${encodeURIComponent(destination)}`;
beforeEach(() => {
  mocks.status = "anon";
  mocks.instance.mockResolvedValue({ oauth_providers: ["google"], atproto_login: true });
  mocks.login.mockResolvedValue({ status: "authed" });
  mocks.challenge.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

async function passwordSignIn() {
  fireEvent.change(screen.getByLabelText("Email or username"), { target: { value: "viewer" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}
async function completeChallenge() {
  fireEvent.click(await screen.findByRole("button", { name: "Use a recovery code instead" }));
  fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "a1b2c-3d4e5" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
}

describe("LoginForm return destination", () => {
  it("returns to the video query and fragment after password sign-in", async () => {
    render(<LoginForm returnTo={destination} />);
    await passwordSignIn();
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith(destination));
    expect(mocks.login).toHaveBeenCalledTimes(1);
  });

  it("falls back home for an external return destination", async () => {
    render(<LoginForm returnTo="//outside.example/video" />);
    await passwordSignIn();
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith("/"));
  });

  it.each([{ oauthPending: true }, { oauthError: "access_denied" }, { mfaPending: true }])(
    "cleans callback markers while retaining the destination: %j", async (marker) => {
      render(<LoginForm {...marker} returnTo={destination} />);
      await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith(loginPath));
    },
  );

  it.each(["password", "provider"])("returns after the %s MFA challenge", async (source) => {
    mocks.login.mockResolvedValue({ status: "mfa_required", mfaToken: "pending-token" });
    render(<LoginForm mfaPending={source === "provider"} returnTo={destination} />);
    if (source === "password") await passwordSignIn();
    expect(mocks.router.push).not.toHaveBeenCalled();
    await completeChallenge();
    await waitFor(() => expect(mocks.challenge).toHaveBeenCalledWith(source === "provider" ? null : "pending-token", "a1b2c-3d4e5"));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith(destination));
  });

  it("returns only after the OAuth session has actually restored", async () => {
    mocks.status = "restoring";
    const view = render(<LoginForm oauthPending returnTo={destination} />);
    expect(screen.getByRole("status", { name: "Completing sign-in" })).toBeTruthy();
    expect(mocks.router.replace).not.toHaveBeenCalledWith(destination);
    mocks.status = "authed";
    view.rerender(<LoginForm oauthPending returnTo={destination} />);
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith(destination));
  });

  it("carries the destination through both provider callback URLs", async () => {
    mocks.bluesky.mockRejectedValue(new Error("controlled stop before navigation"));
    render(<LoginForm returnTo={destination} />);
    const oidc = await screen.findByRole("link", { name: "Continue with Google" });
    expect(new URL(oidc.getAttribute("href")!).searchParams.get("return_to")).toBe(`${loginPath}&oauth=1`);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Bluesky" }));
    fireEvent.change(screen.getByLabelText("Bluesky or ATProto handle"), { target: { value: "viewer.bsky.social" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(mocks.bluesky).toHaveBeenCalledWith("viewer.bsky.social", loginPath));
  });
});
