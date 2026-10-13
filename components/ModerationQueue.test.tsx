// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Report } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  getReports: vi.fn(),
  blockVideo: vi.fn(),
  getReportMessages: vi.fn(),
  postReportMessage: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getReports: mocks.getReports,
    blockVideo: mocks.blockVideo,
    getReportMessages: mocks.getReportMessages,
    postReportMessage: mocks.postReportMessage,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: () => {} }),
  usePathname: () => "/moderation",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: { id: "mod-1", username: "mod", role: "moderator" } }),
}));

const REPORT: Report = {
  id: "r-1",
  reason: "This is the REPORTER's own words about the person they reported",
  status: "open",
  target_type: "video",
  video_id: "v-1",
  video_title: "Control Clip",
  reporter: { username: "bob", display_name: "" },
  created_at: "2026-09-06T12:00:00Z",
  moderator_note: "",
  reasons: [],
} as Report;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getReports.mockResolvedValue({ reports: [REPORT], total: 1, limit: 20, offset: 0 });
  mocks.blockVideo.mockResolvedValue(undefined);
  mocks.getReportMessages.mockResolvedValue({ messages: [], can_reply: true, total: 0, limit: 100, offset: 0 });
  // The queue's two-pane layout auto-selects the first report only on a wide
  // viewport; jsdom has no matchMedia at all.
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

// This is a leak the A16 ruling created and has to close in the same change.
// The block reason used to be the REPORT's reason — the reporter's free text —
// which was harmless while block reasons were staff-only. The ruling makes them
// creator-facing, so shipping it unchanged would deliver a reporter's prose
// about someone to that someone, on their own video and in their inbox.
describe("ModerationQueue — blocking a reported video", () => {
  it("never sends the reporter's words as the block reason", async () => {
    const { ModerationQueue } = await import("./ModerationQueue");
    render(<ModerationQueue />);
    await screen.findByRole("button", { name: /block video/i });

    fireEvent.click(screen.getByRole("button", { name: /block video/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm block/i }));

    await waitFor(() => expect(mocks.blockVideo).toHaveBeenCalled());
    const [, body] = mocks.blockVideo.mock.calls[0];
    expect(body.reason).not.toContain("REPORTER");
    expect(body.reason).toBe("");
  });

  it("sends the moderator's own reason, and says the creator will read it", async () => {
    const { ModerationQueue } = await import("./ModerationQueue");
    render(<ModerationQueue />);
    fireEvent.click(await screen.findByRole("button", { name: /block video/i }));

    // The copy is the point: a moderator who does not know the creator reads
    // this writes it for the ledger, not for a person.
    expect(screen.getByText(/creator sees this/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/block reason/i), {
      target: { value: "Third-party music you do not hold the rights to" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm block/i }));

    await waitFor(() =>
      expect(mocks.blockVideo).toHaveBeenCalledWith("v-1", {
        reason: "Third-party music you do not hold the rights to",
      }),
    );
  });

  it("cancels without blocking anything", async () => {
    const { ModerationQueue } = await import("./ModerationQueue");
    render(<ModerationQueue />);
    fireEvent.click(await screen.findByRole("button", { name: /block video/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByLabelText(/block reason/i)).toBeNull();
    expect(mocks.blockVideo).not.toHaveBeenCalled();
  });
});

describe("ModerationQueue — the report's message thread", () => {
  it("shows staff the thread with who wrote each message, and lets them reply to the reporter", async () => {
    mocks.getReportMessages.mockResolvedValue({
      messages: [
        {
          id: "m-1",
          body: "It is a re-upload of my video",
          by_moderator: false,
          is_mine: false,
          author_username: "bob",
          created_at: "2026-10-01T12:00:00Z",
        },
      ],
      can_reply: true,
      total: 1,
      limit: 100,
      offset: 0,
    });
    mocks.postReportMessage.mockResolvedValue({
      id: "m-2",
      body: "Thanks, looking now",
      by_moderator: true,
      is_mine: true,
      author_username: "mod",
      created_at: "2026-10-01T12:05:00Z",
    });
    const { ModerationQueue } = await import("./ModerationQueue");
    render(<ModerationQueue />);

    const thread = await screen.findByRole("region", { name: "Messages about this report" });
    expect(thread.textContent).toContain("bob · Reporter");
    expect(thread.textContent).toContain("It is a re-upload of my video");
    expect(mocks.getReportMessages).toHaveBeenCalledWith("r-1", { limit: 100, offset: 0 }, expect.anything());

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Thanks, looking now" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mocks.postReportMessage).toHaveBeenCalledWith("r-1", "Thanks, looking now"));
    expect(await screen.findByText("Thanks, looking now")).toBeTruthy();
  });
});

describe("ModerationQueue — report categories and timestamp", () => {
  it("shows category chips and a ?t= link to the reported moment", async () => {
    mocks.getReports.mockResolvedValue({
      reports: [
        { ...REPORT, reasons: ["spamOrMisleading", "captions"], start_seconds: 75, end_seconds: 90 },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const { ModerationQueue } = await import("./ModerationQueue");
    render(<ModerationQueue />);
    await screen.findByRole("region", { name: "Report detail" });

    expect(screen.getAllByText("Spam or misleading").length).toBeGreaterThan(0);
    const at = screen.getByRole("link", { name: "1:15–1:30" });
    expect(at.getAttribute("href")).toBe("/videos/v-1?t=75");
  });

  it("filters by category on the server", async () => {
    const { ModerationQueue } = await import("./ModerationQueue");
    render(<ModerationQueue />);
    await screen.findByRole("region", { name: "Report detail" });

    fireEvent.change(screen.getByLabelText("Filter reports by category"), { target: { value: "privacy" } });
    // The filter lives in the URL (usePagedList); the server does the narrowing.
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(expect.stringContaining("reason=privacy"), expect.anything()));
  });
});
