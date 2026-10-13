// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { updateLiveStream: mocks.update },
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

import { LiveScheduleDialog } from "./LiveScheduleDialog";

const stream = {
  id: "s1", title: "Show", description: "d", privacy: "public", state: "offline",
  permanent: true, replay_enabled: true, scheduled_start_at: "2030-01-01T10:00:00Z",
} as never;

beforeEach(() => {
  mocks.update.mockReset();
});
afterEach(cleanup);

describe("LiveScheduleDialog", () => {
  it("saves a new start as an ISO instant, carrying every other field unchanged", async () => {
    mocks.update.mockResolvedValue({ ...(stream as object), scheduled_start_at: "x" });
    const onSaved = vi.fn();
    render(<LiveScheduleDialog stream={stream} onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Scheduled start"), { target: { value: "2030-02-03T04:05" } });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.update).toHaveBeenCalledWith("s1", {
      title: "Show", description: "d", privacy: "public", permanent: true, replay_enabled: true,
      scheduled_start_at: new Date("2030-02-03T04:05").toISOString(),
    });
  });

  it("Clear schedule sends an explicit null", async () => {
    mocks.update.mockResolvedValue(stream);
    render(<LiveScheduleDialog stream={stream} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear schedule" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][1].scheduled_start_at).toBeNull();
  });

  it("shows the server's refusal and stays open", async () => {
    mocks.update.mockRejectedValue(new Error("422"));
    const onClose = vi.fn();
    render(<LiveScheduleDialog stream={stream} onClose={onClose} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await screen.findByText("Could not update the schedule.");
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
