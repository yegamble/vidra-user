// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLiveStreams: vi.fn(),
  createLiveStream: vi.fn(),
  updateLiveStream: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: mocks,
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock("@/lib/live/availability", () => ({ useLiveAvailable: () => true }));

import { LiveStreamsSection } from "./LiveStreamsSection";

const base = {
  id: "s1", title: "Show", description: "", privacy: "public", state: "offline",
  permanent: false, replay_enabled: false, channel_id: "c1",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  mocks.getLiveStreams.mockReset();
  mocks.createLiveStream.mockReset();
  mocks.updateLiveStream.mockReset();
});
afterEach(cleanup);

describe("LiveStreamsSection scheduling", () => {
  it("shows a scheduled offline stream's start and an action to change it", async () => {
    mocks.getLiveStreams.mockResolvedValue({
      live_streams: [{ ...base, scheduled_start_at: "2030-05-06T07:08:00Z" }],
    });
    render(<LiveStreamsSection handle="ada" />);
    expect(await screen.findByText(/starts /)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reschedule Show" })).toBeTruthy();
  });

  it("offers Schedule, not Reschedule, on an unscheduled stream", async () => {
    mocks.getLiveStreams.mockResolvedValue({ live_streams: [base] });
    render(<LiveStreamsSection handle="ada" />);
    expect(await screen.findByRole("button", { name: "Schedule Show" })).toBeTruthy();
    expect(screen.queryByText(/starts /)).toBeNull();
  });

  it("flipping the replay switch carries the planned start (the update is a full replace)", async () => {
    const at = "2030-05-06T07:08:00Z";
    mocks.getLiveStreams.mockResolvedValue({ live_streams: [{ ...base, scheduled_start_at: at }] });
    mocks.updateLiveStream.mockResolvedValue({ ...base, scheduled_start_at: at, replay_enabled: true });
    render(<LiveStreamsSection handle="ada" />);
    fireEvent.click(await screen.findByLabelText("Save replay as a video for Show"));
    await waitFor(() => expect(mocks.updateLiveStream).toHaveBeenCalled());
    expect(mocks.updateLiveStream.mock.calls[0][1]).toMatchObject({
      replay_enabled: true,
      scheduled_start_at: at,
    });
  });

  it("create sends the chosen start as an ISO instant, and omits it when blank", async () => {
    mocks.getLiveStreams.mockResolvedValue({ live_streams: [] });
    mocks.createLiveStream.mockResolvedValue({ live_stream: base, stream_key: "k" });
    render(<LiveStreamsSection handle="ada" />);
    fireEvent.click(await screen.findByRole("button", { name: "Go live" }));
    fireEvent.change(screen.getByLabelText("Live stream title"), { target: { value: "Show" } });
    fireEvent.change(screen.getByLabelText("Scheduled start"), { target: { value: "2030-02-03T04:05" } });
    fireEvent.click(screen.getByRole("button", { name: "Create live stream" }));
    await waitFor(() => expect(mocks.createLiveStream).toHaveBeenCalledTimes(1));
    expect(mocks.createLiveStream.mock.calls[0][1].scheduled_start_at).toBe(
      new Date("2030-02-03T04:05").toISOString(),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Go live" }));
    fireEvent.change(screen.getByLabelText("Live stream title"), { target: { value: "Two" } });
    fireEvent.click(screen.getByRole("button", { name: "Create live stream" }));
    await waitFor(() => expect(mocks.createLiveStream).toHaveBeenCalledTimes(2));
    expect(mocks.createLiveStream.mock.calls[1][1]).not.toHaveProperty("scheduled_start_at");
  });
});
