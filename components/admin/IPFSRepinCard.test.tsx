// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getIPFSRepin: vi.fn(), startIPFSRepin: vi.fn() }));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, getIPFSRepin: mocks.getIPFSRepin, startIPFSRepin: mocks.startIPFSRepin } };
});

import { ApiError } from "@/lib/api";

import { IPFSRepinCard } from "./IPFSRepinCard";

const run = {
  phase: "idle", started_at: null, finished_at: null, pause_reason: "", scanned: 0, queued: 0, done: 0,
  skipped: 0, blocked: 0, failed: 0, in_flight: 0, remaining: 0, bytes_saved_estimate: 0,
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("IPFSRepinCard", () => {
  it("asks for confirmation before starting, then shows the run", async () => {
    mocks.getIPFSRepin.mockResolvedValue(run);
    mocks.startIPFSRepin.mockResolvedValue({ ...run, phase: "running", scanned: 2, done: 1, skipped: 1, remaining: 6 });
    render(<IPFSRepinCard />);

    fireEvent.click(await screen.findByRole("button", { name: "Re-pin existing videos to the playback-only set" }));
    expect(mocks.startIPFSRepin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start re-pin" }));

    await waitFor(() => expect(mocks.startIPFSRepin).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Running")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Re-pin progress" }).getAttribute("aria-valuenow")).toBe("2");
    expect((screen.getByRole("button", { name: "Re-pin existing videos to the playback-only set" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("cancelling the confirm step starts nothing", async () => {
    mocks.getIPFSRepin.mockResolvedValue(run);
    render(<IPFSRepinCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Re-pin existing videos to the playback-only set" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.startIPFSRepin).not.toHaveBeenCalled();
  });

  it("explains a capacity pause", async () => {
    mocks.getIPFSRepin.mockResolvedValue({ ...run, phase: "paused", pause_reason: "budget_exhausted", scanned: 3, remaining: 9 });
    render(<IPFSRepinCard />);
    expect((await screen.findByRole("status")).textContent).toContain("budget exhausted");
  });

  it("reports a 409 from a second start", async () => {
    mocks.getIPFSRepin.mockResolvedValue(run);
    mocks.startIPFSRepin.mockRejectedValue(new ApiError({ status: 409, code: "conflict", message: "conflict" }));
    render(<IPFSRepinCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Re-pin existing videos to the playback-only set" }));
    fireEvent.click(screen.getByRole("button", { name: "Start re-pin" }));
    expect((await screen.findByRole("alert")).textContent).toBe("A re-pin is already running.");
  });

  it("renders nothing when the backend cannot run it", async () => {
    mocks.getIPFSRepin.mockRejectedValue(new ApiError({ status: 501, code: "not_implemented", message: "no" }));
    const { container } = render(<IPFSRepinCard />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
