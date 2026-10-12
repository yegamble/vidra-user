// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateChannel: vi.fn(), studioUpdate: vi.fn() }));
let current: Record<string, unknown>;

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, updateChannel: mocks.updateChannel } };
});
vi.mock("./StudioContext", () => ({
  useStudio: () => ({
    channels: [current],
    currentChannel: current,
    addChannel: () => {},
    updateChannel: mocks.studioUpdate,
    removeChannel: () => {},
    canManage: true,
  }),
}));
// The cards below the details form have their own tests and their own reads.
vi.mock("./DistributionCard", () => ({ DistributionCard: () => null }));
vi.mock("./CollaboratorsCard", () => ({ CollaboratorsCard: () => null }));
vi.mock("./ChannelProtocolBadges", () => ({ ChannelProtocolBadges: () => null }));
vi.mock("@/components/ChannelSyncSection", () => ({ ChannelSyncSection: () => null }));
vi.mock("@/components/ProfileImageManager", () => ({ ProfileImageManager: () => null }));

import { ChannelManageView } from "./ChannelManage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setChannel(over: Record<string, unknown> = {}) {
  current = {
    id: "c1",
    owner_id: "u1",
    handle: "ada",
    display_name: "Ada",
    description: "hi",
    follower_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    role: "owner",
    ...over,
  };
}

describe("Channel settings — support text", () => {
  it("prefills the channel's support text and saves the edited, trimmed value", async () => {
    setChannel({ support: "Ko-fi: ada" });
    mocks.updateChannel.mockResolvedValue({ ...current, support: "Liberapay: ada" });
    render(<ChannelManageView />);
    const field = screen.getByLabelText("Edit channel support text") as HTMLTextAreaElement;
    expect(field.value).toBe("Ko-fi: ada");
    expect(screen.getByText(/10\/1000/)).toBeTruthy();
    fireEvent.change(field, { target: { value: "  Liberapay: ada  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.updateChannel).toHaveBeenCalledTimes(1));
    expect(mocks.updateChannel).toHaveBeenCalledWith(
      "ada",
      expect.objectContaining({ support: "Liberapay: ada" }),
    );
    await waitFor(() => expect(mocks.studioUpdate).toHaveBeenCalled());
  });

  it("sends an empty string to clear it, and starts empty when the channel has none", async () => {
    setChannel({ support: "Ko-fi: ada" });
    mocks.updateChannel.mockResolvedValue(current);
    render(<ChannelManageView />);
    fireEvent.change(screen.getByLabelText("Edit channel support text"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.updateChannel).toHaveBeenCalledTimes(1));
    expect(mocks.updateChannel.mock.calls[0][1]).toMatchObject({ support: "" });
    cleanup();
    setChannel();
    render(<ChannelManageView />);
    expect((screen.getByLabelText("Edit channel support text") as HTMLTextAreaElement).value).toBe("");
  });
});
