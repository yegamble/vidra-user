// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Report } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  getReports: vi.fn(),
  blockVideo: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getReports: mocks.getReports,
    blockVideo: mocks.blockVideo,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
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
} as Report;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getReports.mockResolvedValue({ reports: [REPORT], total: 1, limit: 20, offset: 0 });
  mocks.blockVideo.mockResolvedValue(undefined);
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
