// @vitest-environment jsdom
//
// SecureAccountSection: the "Finish securing your account" prompt for an
// account created by Bluesky/OIDC sign-in — passwordless, and holding a
// generated address that can never receive mail, so it has exactly one way in
// and no recovery path (A30). These tests hold down the four things that make
// the card honest: it appears only when it applies, it says WHY, the assertion
// it collects is spent on exactly one write, and a dead assertion is reported
// as dead rather than left to be resubmitted.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { startStepUp, setPassword, requestEmailChange, listOAuthIdentities } = vi.hoisted(() => ({
  startStepUp: vi.fn(),
  setPassword: vi.fn(),
  requestEmailChange: vi.fn(),
  listOAuthIdentities: vi.fn(),
}));

// The REAL module, with four calls spied. Keeping ApiError and the client shape
// real is the point: a hand-rolled stub would let the component drift from the
// regenerated contract and still pass.
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      startStepUp,
      setPassword,
      requestEmailChange,
      listOAuthIdentities,
    },
  };
});

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => useSessionMock() }));

const { settledMock } = vi.hoisted(() => ({ settledMock: vi.fn() }));
vi.mock("@/lib/use-settled-session", () => ({ useSettledSession: () => settledMock() }));

import { ApiError } from "@/lib/api";
import type { OAuthIdentity, User } from "@/lib/api";

import { SecureAccountSection } from "./SecureAccountSection";

// Typed against the REGENERATED contract: if `has_password` or
// `email_placeholder` ever leave the User schema, this fixture stops compiling
// and the test stops being a fiction.
function user(overrides: Partial<User> = {}): User {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    username: "alice",
    email: "did-plc-alice@atproto.invalid",
    role: "user",
    email_verified: false,
    has_password: false,
    email_placeholder: true,
    display_name: "Alice",
    bio: "",
    history_enabled: true,
    profile_public: true,
    created_at: "2026-09-09T00:00:00Z",
    ...overrides,
  };
}

const atprotoIdentity: OAuthIdentity = {
  provider: "atproto",
  email: "",
  handle: "alice.bsky.social",
  created_at: "2026-09-09T00:00:00Z",
};

const reloadUser = vi.fn();
const assignMock = vi.fn();
const replaceStateMock = vi.fn();

beforeEach(() => {
  useSessionMock.mockReturnValue({ user: user(), reloadUser });
  settledMock.mockReturnValue({ settled: true, authed: true, viewerId: "u", viewerKey: "authed:u" });
  listOAuthIdentities.mockResolvedValue({ identities: [atprotoIdentity] });
  setPassword.mockResolvedValue(undefined);
  requestEmailChange.mockResolvedValue({ pending: true, new_email: "alice@example.test" });
  reloadUser.mockResolvedValue(undefined);
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { assign: assignMock, pathname: "/settings/security", search: "", hash: "" },
  });
  Object.defineProperty(window, "history", {
    configurable: true,
    writable: true,
    value: { replaceState: replaceStateMock },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SecureAccountSection", () => {
  it("renders nothing for an account that already has a password and a real address", () => {
    useSessionMock.mockReturnValue({
      user: user({ has_password: true, email_placeholder: false, email: "alice@example.test" }),
      reloadUser,
    });
    const { container } = render(<SecureAccountSection />);
    expect(container.firstChild).toBeNull();
  });

  it("says why the account is at risk, naming the provider it depends on", async () => {
    render(<SecureAccountSection />);
    expect(screen.getByRole("heading", { name: "Finish securing your account" })).toBeTruthy();
    // The consequence, not a vague nag: losing the provider account loses this one.
    await waitFor(() => expect(screen.getByText(/If you lose that account/i)).toBeTruthy());
    expect(screen.getByText(/Bluesky/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set a password" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a real email address" })).toBeTruthy();
  });

  it("waits for the session to settle before reading the viewer's identities", async () => {
    settledMock.mockReturnValue({ settled: false, authed: false, viewerId: null, viewerKey: "anon" });
    render(<SecureAccountSection />);
    // A viewer-scoped read fired before the boot-time refresh settles leaves
    // without an Authorization header and comes back as the anonymous answer.
    await waitFor(() => expect(listOAuthIdentities).not.toHaveBeenCalled());
  });

  it("hands off to the provider with the action in return_to", async () => {
    startStepUp.mockResolvedValue({ authorization_url: "https://pds.example/authorize?x=1" });
    render(<SecureAccountSection />);
    await waitFor(() => expect(listOAuthIdentities).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Set a password" }));
    fireEvent.change(screen.getByLabelText("Your Bluesky or ATProto handle"), {
      target: { value: "alice.bsky.social" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Confirm with Bluesky/ }));

    await waitFor(() =>
      expect(startStepUp).toHaveBeenCalledWith({
        provider: "atproto",
        handle: "alice.bsky.social",
        return_to: "/settings/security?secure=password",
      }),
    );
    // Top-level navigation only: the start call sealed an httpOnly attempt
    // cookie, and the authorization URL is for the browser, never for fetch.
    expect(assignMock).toHaveBeenCalledWith("https://pds.example/authorize?x=1");
  });

  it("spends the landed assertion on the password, then reloads the account", async () => {
    render(<SecureAccountSection stepUp="the-assertion" secure="password" />);
    const next = await screen.findByLabelText("New password");
    fireEvent.change(next, { target: { value: "a-brand-new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "a-brand-new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() =>
      expect(setPassword).toHaveBeenCalledWith({
        new_password: "a-brand-new-password",
        step_up_token: "the-assertion",
      }),
    );
    // has_password only flips on the server, so the card has to re-read the
    // account or it would keep prompting for something already done.
    await waitFor(() => expect(reloadUser).toHaveBeenCalled());
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/signed out/i);
  });

  it("refuses a mismatched confirmation without spending the assertion", async () => {
    render(<SecureAccountSection stepUp="the-assertion" secure="password" />);
    fireEvent.change(await screen.findByLabelText("New password"), {
      target: { value: "a-brand-new-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "a-brand-new-passwerd" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    // The assertion is single-use server-side: spending one on a request the
    // client already knows is wrong costs the user a whole round trip.
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("sends the email change with the assertion instead of a password", async () => {
    render(<SecureAccountSection stepUp="the-assertion" secure="email" />);
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "alice@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send confirmation" }));

    await waitFor(() =>
      expect(requestEmailChange).toHaveBeenCalledWith({
        step_up_token: "the-assertion",
        new_email: "alice@example.test",
      }),
    );
    const status = await screen.findByRole("status");
    // The address does NOT move until the link in the new mailbox is used, and
    // the copy has to say so or the user will think they are done.
    expect(status.textContent).toMatch(/does not move until/i);
  });

  it("tells the user a spent or expired assertion needs another round trip", async () => {
    setPassword.mockRejectedValue(
      new ApiError({ status: 403, code: "step_up_required", message: "confirm it is you" }),
    );
    render(<SecureAccountSection stepUp="stale-assertion" secure="password" />);
    fireEvent.change(await screen.findByLabelText("New password"), {
      target: { value: "a-brand-new-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "a-brand-new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/expired or was already used/i);
  });

  it("renders the callback's failure code as a sentence", async () => {
    render(<SecureAccountSection stepUpError="step_up_identity_mismatch" secure="password" />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/not the one linked to this account/i);
  });

  it("strips the landing parameters out of the address bar", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        assign: assignMock,
        pathname: "/settings/security",
        search: "?step_up=the-assertion&secure=password&keep=1",
        hash: "",
      },
    });
    render(<SecureAccountSection stepUp="the-assertion" secure="password" />);
    await waitFor(() => expect(replaceStateMock).toHaveBeenCalled());
    const [, , url] = replaceStateMock.mock.calls[0];
    expect(url).toBe("/settings/security?keep=1");
  });

  it("explains rather than offering a dead button when nothing is linked", async () => {
    listOAuthIdentities.mockResolvedValue({ identities: [] });
    render(<SecureAccountSection />);
    await waitFor(() => expect(listOAuthIdentities).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Set a password" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no linked sign-in/i);
  });
});
