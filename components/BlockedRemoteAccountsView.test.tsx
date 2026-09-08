// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RemoteBlock } from "@/lib/api";

// A29-F7's viewer surface. The fixtures are typed as the contract's own
// RemoteBlockView, so a field renamed in core's openapi.yaml breaks this file
// at compile time rather than passing against an invented shape.

const mocks = vi.hoisted(() => ({
  getRemoteBlocks: vi.fn(),
  blockRemoteActor: vi.fn(),
  unblockRemoteActor: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getRemoteBlocks: mocks.getRemoteBlocks,
      blockRemoteActor: mocks.blockRemoteActor,
      unblockRemoteActor: mocks.unblockRemoteActor,
    },
  };
});

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => mocks.useSession(),
}));

import { BlockedRemoteAccountsView } from "./BlockedRemoteAccountsView";

function block(overrides: Partial<RemoteBlock> = {}): RemoteBlock {
  return {
    actor_url: "https://peer.example/accounts/kaisa",
    handle: "kaisa@peer.example",
    domain: "peer.example",
    blocked_at: "2026-09-05T12:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getRemoteBlocks.mockReset().mockResolvedValue({ actors: [], total: 0, limit: 50, offset: 0 });
  mocks.blockRemoteActor.mockReset().mockResolvedValue(undefined);
  mocks.unblockRemoteActor.mockReset().mockResolvedValue(undefined);
  mocks.useSession.mockReturnValue({ status: "authed", user: { id: "u1" } });
});

afterEach(cleanup);

describe("BlockedRemoteAccountsView", () => {
  it("blocks the identity the viewer pasted and reloads the list", async () => {
    render(<BlockedRemoteAccountsView />);
    await screen.findByText(/No blocked remote accounts/);

    mocks.getRemoteBlocks.mockResolvedValue({ actors: [block()], total: 1, limit: 50, offset: 0 });
    fireEvent.change(screen.getByLabelText("Block a remote account"), {
      target: { value: "@kaisa@peer.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Block" }));

    await waitFor(() => expect(mocks.blockRemoteActor).toHaveBeenCalledWith("@kaisa@peer.example"));
    expect(await screen.findByText("kaisa@peer.example")).toBeTruthy();
  });

  it("shows the actor URL when this instance has never cached the account", async () => {
    mocks.getRemoteBlocks.mockResolvedValue({
      actors: [block({ handle: "", domain: "" })],
      total: 1,
      limit: 50,
      offset: 0,
    });
    render(<BlockedRemoteAccountsView />);
    // A block the viewer cannot see is a block they cannot lift.
    expect(await screen.findByText("https://peer.example/accounts/kaisa")).toBeTruthy();
  });

  it("unblocks with the stored URL verbatim, not the handle", async () => {
    mocks.getRemoteBlocks.mockResolvedValue({ actors: [block()], total: 1, limit: 50, offset: 0 });
    render(<BlockedRemoteAccountsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Unblock" }));
    await waitFor(() =>
      expect(mocks.unblockRemoteActor).toHaveBeenCalledWith("https://peer.example/accounts/kaisa"),
    );
  });

  it("surfaces the backend's refusal verbatim rather than a generic error", async () => {
    const { ApiError } = await import("@/lib/api");
    mocks.blockRemoteActor.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "unprocessable_entity",
        message: "that account is local to this instance; block it from the account itself",
      }),
    );
    render(<BlockedRemoteAccountsView />);
    await screen.findByText(/No blocked remote accounts/);
    fireEvent.change(screen.getByLabelText("Block a remote account"), {
      target: { value: "@ada@videos.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/local to this instance/);
  });

  it("prompts an anonymous viewer to sign in instead of fetching a 401", () => {
    mocks.useSession.mockReturnValue({ status: "anon", user: null });
    render(<BlockedRemoteAccountsView />);
    expect(screen.getByText(/Sign in to manage blocked remote accounts/)).toBeTruthy();
    expect(mocks.getRemoteBlocks).not.toHaveBeenCalled();
  });
});
