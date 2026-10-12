// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BlockedRemoteActor } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  getBlockedRemoteActors: vi.fn(),
  blockRemoteActorInstanceWide: vi.fn(),
  unblockRemoteActorInstanceWide: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => mocks.useSession(),
}));
vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getBlockedRemoteActors: mocks.getBlockedRemoteActors,
      blockRemoteActorInstanceWide: mocks.blockRemoteActorInstanceWide,
      unblockRemoteActorInstanceWide: mocks.unblockRemoteActorInstanceWide,
    },
  };
});

import { ApiError } from "@/lib/api";
import { AdminBlockedRemoteActorsView } from "./AdminBlockedRemoteActorsView";

function apiError(status: number, code: string, message: string) {
  return new ApiError({ status, code, message });
}

const URL_A = "https://peer.example/accounts/kaisa";

function actor(overrides: Partial<BlockedRemoteActor> = {}): BlockedRemoteActor {
  return {
    actor_url: URL_A,
    handle: "kaisa@peer.example",
    domain: "peer.example",
    reason: "harassment",
    blocked_at: "2026-10-01T12:00:00Z",
    ...overrides,
  };
}

function page(actors: BlockedRemoteActor[]) {
  return { actors, total: actors.length, limit: 10, offset: 0 };
}

beforeEach(() => {
  mocks.getBlockedRemoteActors.mockReset().mockResolvedValue(page([]));
  mocks.blockRemoteActorInstanceWide.mockReset().mockResolvedValue(undefined);
  mocks.unblockRemoteActorInstanceWide.mockReset().mockResolvedValue(undefined);
  mocks.useSession.mockReturnValue({ status: "authed", user: { id: "m1", role: "moderator" } });
});

afterEach(cleanup);

describe("AdminBlockedRemoteActorsView", () => {
  it("lists blocked accounts with handle, domain and reason, and explains the scope", async () => {
    mocks.getBlockedRemoteActors.mockResolvedValue(page([actor()]));
    render(<AdminBlockedRemoteActorsView />);
    expect(await screen.findByText("kaisa@peer.example")).toBeTruthy();
    expect(screen.getByText(/harassment/)).toBeTruthy();
    expect(screen.getByText(/across the whole instance/)).toBeTruthy();
  });

  it("falls back to the actor URL for a never-cached actor (empty handle)", async () => {
    mocks.getBlockedRemoteActors.mockResolvedValue(page([actor({ handle: "" })]));
    render(<AdminBlockedRemoteActorsView />);
    expect(await screen.findByText(URL_A)).toBeTruthy();
  });

  it("shows the empty state", async () => {
    render(<AdminBlockedRemoteActorsView />);
    expect(await screen.findByText("No blocked remote accounts")).toBeTruthy();
  });

  it("shows an error state when the list fails to load", async () => {
    mocks.getBlockedRemoteActors.mockRejectedValue(apiError(500, "internal", "boom"));
    render(<AdminBlockedRemoteActorsView />);
    expect(await screen.findByText(/Could not load the blocked remote accounts/)).toBeTruthy();
  });

  it("caps the reason at the contract's 500-character maxLength", async () => {
    render(<AdminBlockedRemoteActorsView />);
    await screen.findByText("No blocked remote accounts");
    expect(screen.getByLabelText("Reason for blocking (optional)").getAttribute("maxLength")).toBe("500");
  });

  it("blocks by handle with the optional reason, then reloads", async () => {
    render(<AdminBlockedRemoteActorsView />);
    await screen.findByText("No blocked remote accounts");
    fireEvent.change(screen.getByLabelText("Remote account to block"), {
      target: { value: "  @kaisa@peer.example " },
    });
    fireEvent.change(screen.getByLabelText("Reason for blocking (optional)"), {
      target: { value: " harassment " },
    });
    mocks.getBlockedRemoteActors.mockResolvedValue(page([actor()]));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await waitFor(() =>
      expect(mocks.blockRemoteActorInstanceWide).toHaveBeenCalledWith({
        actor: "@kaisa@peer.example",
        reason: "harassment",
      }),
    );
    expect(await screen.findByText("kaisa@peer.example")).toBeTruthy();
  });

  it("surfaces the backend's 422 message", async () => {
    mocks.blockRemoteActorInstanceWide.mockRejectedValue(
      apiError(422, "validation_failed", "that account is local to this instance"),
    );
    render(<AdminBlockedRemoteActorsView />);
    await screen.findByText("No blocked remote accounts");
    fireEvent.change(screen.getByLabelText("Remote account to block"), {
      target: { value: "@me@here.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    expect((await screen.findByRole("alert")).textContent).toContain("local to this instance");
  });

  it("unblocks only after confirmation, sending the verbatim actor URL", async () => {
    mocks.getBlockedRemoteActors.mockResolvedValue(page([actor()]));
    render(<AdminBlockedRemoteActorsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Unblock kaisa@peer.example" }));
    expect(mocks.unblockRemoteActorInstanceWide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm unblock" }));
    await waitFor(() =>
      expect(mocks.unblockRemoteActorInstanceWide).toHaveBeenCalledWith(URL_A),
    );
    await waitFor(() => expect(screen.queryByText("kaisa@peer.example")).toBeNull());
  });

  it("refuses a regular user and fetches nothing", () => {
    mocks.useSession.mockReturnValue({ status: "authed", user: { id: "u1", role: "user" } });
    render(<AdminBlockedRemoteActorsView />);
    expect(screen.getByText("Moderators only")).toBeTruthy();
    expect(mocks.getBlockedRemoteActors).not.toHaveBeenCalled();
  });

  it("admits an admin", async () => {
    mocks.useSession.mockReturnValue({ status: "authed", user: { id: "a1", role: "admin" } });
    render(<AdminBlockedRemoteActorsView />);
    expect(await screen.findByText("No blocked remote accounts")).toBeTruthy();
  });
});
