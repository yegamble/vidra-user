// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InstanceFollow } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  getInstanceFollowing: vi.fn(),
  getInstanceFollowers: vi.fn(),
  followInstance: vi.fn(),
  unfollowInstance: vi.fn(),
  acceptInstanceFollower: vi.fn(),
  rejectInstanceFollower: vi.fn(),
  removeInstanceFollower: vi.fn(),
}));
const useSession = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => useSession() }));
vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, ...mocks } };
});

import { ApiError } from "@/lib/api";
import { AdminFederationInstancesView } from "./AdminFederationInstancesView";

function follow(overrides: Partial<InstanceFollow> = {}): InstanceFollow {
  return {
    id: "f-1",
    actor_url: "https://pt.example/accounts/peertube",
    host: "pt.example",
    handle: "peertube@pt.example",
    state: "pending",
    created_at: "2026-10-01T12:00:00Z",
    ...overrides,
  };
}

const page = (follows: InstanceFollow[]) => ({ follows, total: follows.length, limit: 20, offset: 0 });

function section(name: string) {
  return within(screen.getByRole("region", { name }));
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getInstanceFollowing.mockResolvedValue(page([]));
  mocks.getInstanceFollowers.mockResolvedValue(page([]));
  useSession.mockReturnValue({ status: "authed", user: { id: "a1", role: "admin" } });
});

afterEach(cleanup);

describe("AdminFederationInstancesView", () => {
  it("shows both empty states", async () => {
    render(<AdminFederationInstancesView />);
    expect(await screen.findByText("Not following any instances")).toBeTruthy();
    expect(await screen.findByText("No instance follows this one yet")).toBeTruthy();
  });

  it("shows an error state when a list fails to load", async () => {
    mocks.getInstanceFollowers.mockRejectedValue(new ApiError({ status: 500, code: "internal", message: "boom" }));
    render(<AdminFederationInstancesView />);
    expect(await screen.findByText(/Could not load the instances following this one/)).toBeTruthy();
  });

  it("follows an instance by host and lists it as pending", async () => {
    mocks.followInstance.mockResolvedValue(follow({ id: "g-1", host: "videos.example", handle: "peertube@videos.example" }));
    render(<AdminFederationInstancesView />);
    await screen.findByText("Not following any instances");
    fireEvent.change(screen.getByLabelText("Instance host to follow"), { target: { value: " Videos.Example " } });
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    await waitFor(() => expect(mocks.followInstance).toHaveBeenCalledWith("videos.example"));
    const following = section("Following");
    expect(await following.findByText("videos.example")).toBeTruthy();
    expect(following.getByText("Pending")).toBeTruthy();
  });

  it("explains a host that cannot be followed", async () => {
    mocks.followInstance.mockRejectedValue(new ApiError({ status: 422, code: "unprocessable_entity", message: "validation failed" }));
    render(<AdminFederationInstancesView />);
    fireEvent.change(await screen.findByLabelText("Instance host to follow"), { target: { value: "nowhere" } });
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/reachable PeerTube or vidra instance/);
  });

  it("unfollows after a confirmation", async () => {
    mocks.getInstanceFollowing.mockResolvedValue(page([follow({ state: "accepted" })]));
    render(<AdminFederationInstancesView />);
    fireEvent.click(await screen.findByRole("button", { name: "Unfollow pt.example" }));
    expect(mocks.unfollowInstance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm unfollow pt.example" }));
    await waitFor(() => expect(mocks.unfollowInstance).toHaveBeenCalledWith("f-1"));
    expect(await screen.findByText("Not following any instances")).toBeTruthy();
  });

  it("accepts a pending follower, then offers reject and remove", async () => {
    mocks.getInstanceFollowers.mockResolvedValue(page([follow()]));
    render(<AdminFederationInstancesView />);
    const followers = section("Followers");
    fireEvent.click(await followers.findByRole("button", { name: "Accept pt.example" }));
    fireEvent.click(followers.getByRole("button", { name: "Confirm accept pt.example" }));
    await waitFor(() => expect(mocks.acceptInstanceFollower).toHaveBeenCalledWith("f-1"));
    expect(await followers.findByText("Accepted")).toBeTruthy();
    expect(followers.getByRole("button", { name: "Reject pt.example" })).toBeTruthy();
    expect(followers.getByRole("button", { name: "Remove pt.example" })).toBeTruthy();
  });

  it("rejects, then removes, a follower", async () => {
    mocks.getInstanceFollowers.mockResolvedValue(page([follow()]));
    render(<AdminFederationInstancesView />);
    const followers = section("Followers");
    fireEvent.click(await followers.findByRole("button", { name: "Reject pt.example" }));
    fireEvent.click(followers.getByRole("button", { name: "Confirm reject pt.example" }));
    expect(await followers.findByText("Rejected")).toBeTruthy();
    fireEvent.click(followers.getByRole("button", { name: "Remove pt.example" }));
    fireEvent.click(followers.getByRole("button", { name: "Confirm remove pt.example" }));
    await waitFor(() => expect(mocks.removeInstanceFollower).toHaveBeenCalledWith("f-1"));
    expect(await followers.findByText("No instance follows this one yet")).toBeTruthy();
  });

  it("is admin only", () => {
    useSession.mockReturnValue({ status: "authed", user: { id: "m1", role: "moderator" } });
    render(<AdminFederationInstancesView />);
    expect(mocks.getInstanceFollowers).not.toHaveBeenCalled();
    expect(mocks.getInstanceFollowing).not.toHaveBeenCalled();
  });
});
