// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVideoOwnershipChanges: vi.fn(),
  acceptVideoOwnershipChange: vi.fn(),
  refuseVideoOwnershipChange: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getVideoOwnershipChanges: mocks.getVideoOwnershipChanges,
      acceptVideoOwnershipChange: mocks.acceptVideoOwnershipChange,
      refuseVideoOwnershipChange: mocks.refuseVideoOwnershipChange,
    },
  };
});

import { ApiError } from "@/lib/api";
import type { Channel, VideoOwnershipChange } from "@/lib/api";

import { OwnershipRequestsView } from "./OwnershipRequestsView";

function channel(id: string, handle: string): Channel {
  return { id, owner_id: "me", handle, display_name: handle.toUpperCase() } as Channel;
}

function change(overrides: Partial<VideoOwnershipChange> = {}): VideoOwnershipChange {
  return {
    id: "oc1",
    status: "pending",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    video: { id: "v1", title: "Gift Clip" },
    initiator: { username: "ada", display_name: "Ada" },
    ...overrides,
  };
}

function page(changes: VideoOwnershipChange[]) {
  return { changes, total: changes.length, limit: 20, offset: 0 };
}

const mine = [channel("c1", "main"), channel("c2", "second")];

afterEach(cleanup);
beforeEach(() => {
  mocks.getVideoOwnershipChanges.mockReset();
  mocks.acceptVideoOwnershipChange.mockReset();
  mocks.refuseVideoOwnershipChange.mockReset();
});

describe("OwnershipRequestsView", () => {
  it("accepts a request into the chosen channel and shows it as accepted", async () => {
    mocks.getVideoOwnershipChanges.mockResolvedValue(page([change()]));
    mocks.acceptVideoOwnershipChange.mockResolvedValue(undefined);
    render(<OwnershipRequestsView channels={mine} />);

    const row = (await screen.findByText("Gift Clip")).closest("li")!;
    expect(within(row).getByText(/Ada/)).toBeTruthy();
    fireEvent.change(within(row).getByLabelText("Accept into channel"), { target: { value: "c2" } });
    fireEvent.click(within(row).getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(mocks.acceptVideoOwnershipChange).toHaveBeenCalledWith("oc1", "c2"));
    expect(await within(row).findByText("Accepted")).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Refuse" })).toBeNull();
  });

  it("refuses a request and leaves no actions behind", async () => {
    mocks.getVideoOwnershipChanges.mockResolvedValue(page([change()]));
    mocks.refuseVideoOwnershipChange.mockResolvedValue(undefined);
    render(<OwnershipRequestsView channels={mine} />);

    fireEvent.click(await screen.findByRole("button", { name: "Refuse" }));
    await waitFor(() => expect(mocks.refuseVideoOwnershipChange).toHaveBeenCalledWith("oc1"));
    expect(await screen.findByText("Refused")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("explains a quota refusal instead of echoing the server", async () => {
    mocks.getVideoOwnershipChanges.mockResolvedValue(page([change()]));
    mocks.acceptVideoOwnershipChange.mockRejectedValue(
      new ApiError({ status: 422, code: "quota_exceeded", message: "storage quota exceeded" }),
    );
    render(<OwnershipRequestsView channels={mine} />);

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/does not fit your storage quota/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
  });

  it("asks for a channel before it can accept, but still allows refusing", async () => {
    mocks.getVideoOwnershipChanges.mockResolvedValue(page([change()]));
    render(<OwnershipRequestsView channels={[]} />);

    expect(await screen.findByRole("link", { name: /Create a channel/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.getByRole("button", { name: "Refuse" })).toBeTruthy();
  });

  it("shows answered requests as history without actions", async () => {
    mocks.getVideoOwnershipChanges.mockResolvedValue(page([change({ status: "refused" })]));
    render(<OwnershipRequestsView channels={mine} />);

    expect(await screen.findByText("Refused")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refuse" })).toBeNull();
  });

  it("has empty and error states", async () => {
    mocks.getVideoOwnershipChanges.mockResolvedValueOnce(page([]));
    render(<OwnershipRequestsView channels={mine} />);
    expect(await screen.findByText("No ownership requests")).toBeTruthy();
    cleanup();

    mocks.getVideoOwnershipChanges.mockRejectedValueOnce(new Error("boom"));
    mocks.getVideoOwnershipChanges.mockResolvedValueOnce(page([change()]));
    render(<OwnershipRequestsView channels={mine} />);
    expect(await screen.findByText("Could not load your ownership requests.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Try again|Retry/ }));
    expect(await screen.findByText("Gift Clip")).toBeTruthy();
  });
});

describe("OwnershipRequestsView — channels arriving late", () => {
  // The requests can load before the studio's channel list. The picker must
  // follow the channels once they arrive (a one-channel user could otherwise
  // never enable Accept), and "Create a channel" must not flash while they load.
  it("does not offer channel creation while channels load, then accepts into the first one", async () => {
    mocks.getVideoOwnershipChanges.mockResolvedValue(page([change()]));
    mocks.acceptVideoOwnershipChange.mockResolvedValue(undefined);
    const { rerender } = render(<OwnershipRequestsView channels={[]} channelsStatus="loading" />);

    await screen.findByText("Gift Clip");
    expect(screen.queryByRole("link", { name: /Create a channel/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.getByRole("button", { name: "Refuse" })).toBeTruthy();

    rerender(<OwnershipRequestsView channels={[channel("c1", "only")]} channelsStatus="ready" />);
    const accept = screen.getByRole("button", { name: "Accept" });
    expect(accept.hasAttribute("disabled")).toBe(false);
    fireEvent.click(accept);
    await waitFor(() => expect(mocks.acceptVideoOwnershipChange).toHaveBeenCalledWith("oc1", "c1"));
  });

  it("shows a request that can no longer be answered as no longer available, with no actions", async () => {
    mocks.getVideoOwnershipChanges.mockResolvedValue(page([change({ id: "b", status: "expired" })]));
    render(<OwnershipRequestsView channels={mine} />);

    expect(await screen.findByText("No longer available")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refuse" })).toBeNull();
  });
});
