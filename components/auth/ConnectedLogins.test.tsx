// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listOAuthIdentities = vi.fn<(signal?: AbortSignal) => Promise<unknown>>();
const unlinkOAuthIdentity = vi.fn<(provider: string) => Promise<void>>(() => Promise.resolve());
vi.mock("@/lib/api", () => ({
  authApi: {
    listOAuthIdentities: (signal?: AbortSignal) => listOAuthIdentities(signal),
    unlinkOAuthIdentity: (provider: string) => unlinkOAuthIdentity(provider),
  },
  ApiError: class ApiError extends Error {},
  errorMessage: () => "Something went wrong.",
}));

import { ConnectedLogins } from "./ConnectedLogins";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConnectedLogins", () => {
  beforeEach(() => {
    listOAuthIdentities.mockResolvedValue({
      identities: [
        { provider: "atproto", email: "", handle: "ada.bsky.social", created_at: "2026-07-01" },
      ],
    });
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
      identities: [{ provider: "google", email: "ada@example.com", created_at: "2026-07-01" }],
    });
    render(<ConnectedLogins />);
    expect(await screen.findByText("Google")).toBeTruthy();
    expect(screen.getByText(/ada@example\.com/)).toBeTruthy();
  });

  it("falls back to the honest placeholder when an identity carries neither", async () => {
    listOAuthIdentities.mockResolvedValue({
      identities: [{ provider: "google", email: "", created_at: "2026-07-01" }],
    });
    render(<ConnectedLogins />);
    expect(await screen.findByText(/no email recorded/)).toBeTruthy();
  });
});
