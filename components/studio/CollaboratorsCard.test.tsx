// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listChannelMembers: vi.fn(),
  addChannelMember: vi.fn(),
  removeChannelMember: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      listChannelMembers: mocks.listChannelMembers,
      addChannelMember: mocks.addChannelMember,
      removeChannelMember: mocks.removeChannelMember,
    },
  };
});

import { ApiError } from "@/lib/api";
import type { Channel, ChannelMember } from "@/lib/api";

import { CollaboratorsCard } from "./CollaboratorsCard";

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "c1",
    owner_id: "u1",
    handle: "ada_makes",
    display_name: "Ada Makes",
    description: "",
    follower_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    activitypub_enabled: true,
    atproto_enabled: true,
    ...overrides,
  } as Channel;
}

function member(overrides: Partial<ChannelMember> = {}): ChannelMember {
  return {
    user_id: "u2",
    username: "bob",
    display_name: "Bob",
    role: "editor",
    created_at: "2026-01-02T00:00:00Z",
    ...overrides,
  } as ChannelMember;
}

afterEach(cleanup);
beforeEach(() => {
  mocks.listChannelMembers.mockReset();
  mocks.addChannelMember.mockReset();
  mocks.removeChannelMember.mockReset();
});

describe("CollaboratorsCard", () => {
  it("owner sees the member list, invites by handle, and appends the new editor", async () => {
    mocks.listChannelMembers.mockResolvedValue({ members: [] });
    mocks.addChannelMember.mockResolvedValue(member());

    render(<CollaboratorsCard channel={channel()} canManage />);

    await screen.findByText("No collaborators yet.");
    fireEvent.change(screen.getByLabelText("Collaborator handle"), { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: "Add editor" }));

    await waitFor(() =>
      expect(mocks.addChannelMember).toHaveBeenCalledWith("ada_makes", {
        handle: "bob",
        role: "editor",
      }),
    );
    expect(await screen.findByText(/@bob/)).toBeTruthy();
  });

  it("surfaces 404 and 409 invite errors inline", async () => {
    mocks.listChannelMembers.mockResolvedValue({ members: [] });
    mocks.addChannelMember.mockRejectedValueOnce(
      new ApiError({ status: 404, code: "not_found", message: "no user" }),
    );

    render(<CollaboratorsCard channel={channel()} canManage />);
    await screen.findByText("No collaborators yet.");

    fireEvent.change(screen.getByLabelText("Collaborator handle"), { target: { value: "ghost" } });
    fireEvent.click(screen.getByRole("button", { name: "Add editor" }));
    expect(await screen.findByText("No such user.")).toBeTruthy();

    mocks.addChannelMember.mockRejectedValueOnce(
      new ApiError({ status: 409, code: "conflict", message: "already" }),
    );
    fireEvent.change(screen.getByLabelText("Collaborator handle"), { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: "Add editor" }));
    expect(await screen.findByText("That user already manages this channel.")).toBeTruthy();
  });

  it("owner removes a member after confirming", async () => {
    mocks.listChannelMembers.mockResolvedValue({ members: [member()] });
    mocks.removeChannelMember.mockResolvedValue(undefined);

    render(<CollaboratorsCard channel={channel()} canManage />);
    await screen.findByText(/@bob/);

    fireEvent.click(screen.getByRole("button", { name: "Remove bob" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(mocks.removeChannelMember).toHaveBeenCalledWith("ada_makes", "u2"),
    );
    await waitFor(() => expect(screen.queryByText(/@bob/)).toBeNull());
  });

  it("editor view is read-only: no invite form, no remove controls", async () => {
    mocks.listChannelMembers.mockResolvedValue({ members: [member()] });

    render(<CollaboratorsCard channel={channel()} />);
    await screen.findByText(/@bob/);

    expect(screen.queryByLabelText("Collaborator handle")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add editor" })).toBeNull();
  });
});
