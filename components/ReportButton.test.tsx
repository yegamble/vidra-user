// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reportVideo: vi.fn(), reportComment: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: { reportVideo: mocks.reportVideo, reportComment: mocks.reportComment },
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

import { ReportDialog } from "./ReportButton";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reportVideo.mockResolvedValue(undefined);
  mocks.reportComment.mockResolvedValue(undefined);
});
afterEach(cleanup);

function fillReason() {
  fireEvent.change(screen.getByLabelText("Reason for report"), { target: { value: "bad" } });
}

describe("ReportDialog — video categories and time range", () => {
  it("sends the old two-argument call when nothing structured is chosen", async () => {
    render(<ReportDialog kind="video" targetId="v-1" onClose={() => {}} />);
    fillReason();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(mocks.reportVideo).toHaveBeenCalledWith("v-1", "bad"));
  });

  it("sends chosen categories and a parsed range", async () => {
    render(<ReportDialog kind="video" targetId="v-1" onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Captions"));
    fireEvent.click(screen.getByLabelText("Privacy"));
    fireEvent.change(screen.getByLabelText("From (m:ss)"), { target: { value: "1:15" } });
    fireEvent.change(screen.getByLabelText("To (m:ss, optional)"), { target: { value: "90" } });
    fillReason();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() =>
      expect(mocks.reportVideo).toHaveBeenCalledWith("v-1", "bad", {
        reasons: ["captions", "privacy"],
        start_seconds: 75,
        end_seconds: 90,
      }),
    );
  });

  it("blocks an end before the start without calling the API", async () => {
    render(<ReportDialog kind="video" targetId="v-1" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("From (m:ss)"), { target: { value: "2:00" } });
    fireEvent.change(screen.getByLabelText("To (m:ss, optional)"), { target: { value: "1:00" } });
    fillReason();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByText("The end must come after the start.")).toBeTruthy();
    expect(mocks.reportVideo).not.toHaveBeenCalled();
  });

  it("offers no categories or time range for a comment report", () => {
    render(<ReportDialog kind="comment" targetId="c-1" onClose={() => {}} />);
    expect(screen.queryByLabelText("Captions")).toBeNull();
    expect(screen.queryByLabelText("From (m:ss)")).toBeNull();
  });
});
