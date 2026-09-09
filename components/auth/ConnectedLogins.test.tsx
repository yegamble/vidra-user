// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InstanceResponse, OAuthIdentity } from "@/lib/api";
import type { SettledSession } from "@/lib/use-settled-session";

const listOAuthIdentities = vi.fn<(signal?: AbortSignal) => Promise<unknown>>();
const unlinkOAuthIdentity = vi.fn<(provider: string) => Promise<void>>(() => Promise.resolve());
const startOAuthLink =
  vi.fn<(provider: string, returnTo: string) => Promise<{ authorization_url: string }>>();
const startATProtoLink =
  vi.fn<(handle: string, returnTo: string) => Promise<{ authorization_url: string }>>();
const getInstance = vi.fn<(signal?: AbortSignal) => Promise<unknown>>();

vi.mock("@/lib/api", () => ({
  authApi: {
    listOAuthIdentities: (signal?: AbortSignal) => listOAuthIdentities(signal),
    unlinkOAuthIdentity: (provider: string) => unlinkOAuthIdentity(provider),
    startOAuthLink: (provider: string, returnTo: string) => startOAuthLink(provider, returnTo),
    startATProtoLink: (handle: string, returnTo: string) => startATProtoLink(handle, returnTo),
  },
  api: { getInstance: (signal?: AbortSignal) => getInstance(signal) },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`status ${status}`);
      this.status = status;
    }
  },
  errorMessage: () => "Something went wrong.",
}));

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
}));

// The session seam every viewer-scoped read in this repo goes through. Settled
// and authed is the state this component actually renders in; the point of the
// hook is that it does not fetch BEFORE that.
const settledSession = vi.fn<() => SettledSession>(() => ({
  settled: true,
  authed: true,
  viewerId: "u1",
  viewerKey: "authed:u1",
}));
vi.mock("@/lib/use-settled-session", () => ({
  useSettledSession: () => settledSession(),
}));

import { ConnectedLogins } from "./ConnectedLogins";

// Typed from the generated contract, so a field leaving the schema stops this
// file compiling rather than letting it pass on a fiction.
const identity = (over: Partial<OAuthIdentity>): OAuthIdentity => ({
  provider: "google",
  email: "",
  created_at: "2026-07-01",
  ...over,
});
const instance = (over: Partial<InstanceResponse>): Partial<InstanceResponse> => ({
  oauth_providers: [],
  atproto_login: false,
  ...over,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  settledSession.mockReturnValue({
    settled: true,
    authed: true,
    viewerId: "u1",
    viewerKey: "authed:u1",
  });
  search = new URLSearchParams();
});

describe("ConnectedLogins", () => {
  beforeEach(() => {
    listOAuthIdentities.mockResolvedValue({
      identities: [identity({ provider: "atproto", handle: "ada.bsky.social" })],
    });
    getInstance.mockResolvedValue(instance({ atproto_login: true }));
  });

  // An ATProto identity carries no email BY DESIGN (the account's synthetic
  // address is deliberately non-routable), but it does carry the handle — which
  // is the only thing that tells the owner WHICH account signs them in. Showing
  // "no email recorded" instead was the whole row's information content.
  it("identifies an ATProto identity by its handle, under the Bluesky name", async () => {
    render(<ConnectedLogins />);
    await waitFor(() => expect(listOAuthIdentities).toHaveBeenCalled());
    expect(await screen.findByText("Bluesky")).toBeTruthy();
    expect(screen.getByText(/@ada\.bsky\.social/)).toBeTruthy();
    expect(screen.queryByText(/no email recorded/)).toBeNull();
    expect(screen.getByLabelText("Unlink Bluesky")).toBeTruthy();
  });

  it("still identifies an OIDC provider by its email", async () => {
    listOAuthIdentities.mockResolvedValue({
      identities: [identity({ provider: "google", email: "ada@example.com" })],
    });
    getInstance.mockResolvedValue(instance({ oauth_providers: ["google"] }));
    render(<ConnectedLogins />);
    expect(await screen.findByText("Google")).toBeTruthy();
    expect(screen.getByText(/ada@example\.com/)).toBeTruthy();
  });

  it("falls back to the honest placeholder when an identity carries neither", async () => {
    listOAuthIdentities.mockResolvedValue({ identities: [identity({ provider: "google" })] });
    getInstance.mockResolvedValue(instance({ oauth_providers: ["google"] }));
    render(<ConnectedLogins />);
    expect(await screen.findByText(/no email recorded/)).toBeTruthy();
  });

  // The control the A05 ruling made necessary: an email match no longer links,
  // so a provider this account has NOT connected needs a way to be connected.
  it("offers Connect for a configured provider the account has not linked", async () => {
    listOAuthIdentities.mockResolvedValue({ identities: [] });
    getInstance.mockResolvedValue(instance({ oauth_providers: ["google", "keycloak"] }));
    startOAuthLink.mockResolvedValue({ authorization_url: "https://idp.example/authorize?x=1" });
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { assign }, writable: true });

    render(<ConnectedLogins />);
    const connect = await screen.findByLabelText("Connect Google");
    expect(screen.getByLabelText("Connect Keycloak")).toBeTruthy();
    expect(screen.queryByLabelText("Unlink Google")).toBeNull();

    fireEvent.click(connect);
    await waitFor(() => expect(startOAuthLink).toHaveBeenCalledWith("google", "/settings"));
    // TOP-LEVEL navigation, never fetch: the provider needs a real user agent
    // and the attempt is sealed into an httpOnly cookie only a navigation
    // carries back.
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://idp.example/authorize?x=1"));
  });

  it("shows Unlink, not Connect, for a provider that IS linked", async () => {
    listOAuthIdentities.mockResolvedValue({
      identities: [identity({ provider: "google", email: "ada@example.com" })],
    });
    getInstance.mockResolvedValue(instance({ oauth_providers: ["google"] }));
    render(<ConnectedLogins />);
    expect(await screen.findByLabelText("Unlink Google")).toBeTruthy();
    expect(screen.queryByLabelText("Connect Google")).toBeNull();
  });

  // The refusal the flow exists to make: an identity is never MOVED between
  // accounts, and the callback says so with a code this renders honestly.
  it("renders the callback's link_error and clears it from the URL", async () => {
    listOAuthIdentities.mockResolvedValue({ identities: [] });
    getInstance.mockResolvedValue(instance({ oauth_providers: ["google"] }));
    search = new URLSearchParams("link_error=identity_belongs_to_another_account");
    render(<ConnectedLogins />);
    expect(
      await screen.findByText(/already connected to a different account here/i),
    ).toBeTruthy();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings"));
  });

  it("confirms a completed connection from the callback marker", async () => {
    listOAuthIdentities.mockResolvedValue({
      identities: [identity({ provider: "google", email: "ada@example.com" })],
    });
    getInstance.mockResolvedValue(instance({ oauth_providers: ["google"] }));
    search = new URLSearchParams("link=google");
    render(<ConnectedLogins />);
    expect(await screen.findByText(/Google is now connected/i)).toBeTruthy();
  });

  // A provider the operator has switched OFF must still show what the account
  // has connected to it — otherwise the identity is invisible and unremovable.
  it("keeps showing an identity for a provider the instance no longer offers", async () => {
    listOAuthIdentities.mockResolvedValue({
      identities: [identity({ provider: "keycloak", email: "ada@example.com" })],
    });
    getInstance.mockResolvedValue(instance({ oauth_providers: [] }));
    render(<ConnectedLogins />);
    expect(await screen.findByLabelText("Unlink Keycloak")).toBeTruthy();
  });

  // The fetch-before-restore class: no viewer-scoped request may be issued
  // before the boot silent refresh has decided who the viewer is.
  it("does not read the identity list before the session settles", async () => {
    // mockReturnValue, not …Once: the component re-renders, and a one-shot
    // "restoring" that flips to "settled" on the second render would let the
    // effect fire and the assertion pass for the wrong reason.
    settledSession.mockReturnValue({
      settled: false,
      authed: false,
      viewerId: null,
      viewerKey: "anon",
    });
    render(<ConnectedLogins />);
    await waitFor(() => expect(getInstance).toHaveBeenCalled());
    expect(listOAuthIdentities).not.toHaveBeenCalled();
  });
});
