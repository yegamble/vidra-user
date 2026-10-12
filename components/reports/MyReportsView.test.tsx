// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MyReport } from "@/lib/api";

import { MyReportDetail } from "./MyReportDetail";
import { MyReportsView } from "./MyReportsView";

const mocks = vi.hoisted(() => ({
  getMyReports: vi.fn(),
  getMyReport: vi.fn(),
  getReportMessages: vi.fn(),
  session: { status: "authed" as string },
}));

vi.mock("@/lib/api", () => ({
  api: {
    getMyReports: mocks.getMyReports,
    getMyReport: mocks.getMyReport,
    getReportMessages: mocks.getReportMessages,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: mocks.session.status, user: { id: "u-1", username: "bob" } }),
}));
vi.mock("@/lib/use-browse-auto-load", () => ({ useBrowseAutoLoad: () => false }));

function report(over: Partial<MyReport>): MyReport {
  return {
    id: "r-1",
    target_type: "video",
    status: "open",
    reason: "spam",
    created_at: "2026-10-01T12:00:00Z",
    last_activity_at: "2026-10-01T12:00:00Z",
    message_count: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.status = "authed";
  mocks.getReportMessages.mockResolvedValue({ messages: [], can_reply: true, total: 0, limit: 100, offset: 0 });
});
afterEach(cleanup);

describe("MyReportsView", () => {
  it("lists each report with its state, target and thread activity, linking to its detail", async () => {
    mocks.getMyReports.mockResolvedValue({
      reports: [
        report({ id: "r-1", status: "accepted", video_title: "Clip", message_count: 2 }),
        report({ id: "r-2", target_type: "account", reported_username: "mallory" }),
        report({ id: "r-3", target_type: "comment" }),
      ],
      total: 3,
      limit: 20,
      offset: 0,
    });
    render(<MyReportsView />);

    const links = await screen.findAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/settings/reports/r-1",
      "/settings/reports/r-2",
      "/settings/reports/r-3",
    ]);
    expect(links[0].textContent).toContain("“Clip”");
    expect(links[0].textContent).toContain("Accepted");
    expect(links[0].textContent).toContain("2 messages");
    expect(links[1].textContent).toContain("@mallory");
    expect(links[1].textContent).toContain("Open");
    expect(links[2].textContent).toContain("A comment");
  });

  it("says so when there are no reports", async () => {
    mocks.getMyReports.mockResolvedValue({ reports: [], total: 0, limit: 20, offset: 0 });
    render(<MyReportsView />);
    expect(await screen.findByText("No reports yet")).toBeTruthy();
  });

  it("asks a signed-out visitor to sign in and fetches nothing", async () => {
    mocks.session.status = "anon";
    render(<MyReportsView />);
    expect(screen.getAllByText(/sign in/i).length).toBeGreaterThan(0);
    expect(mocks.getMyReports).not.toHaveBeenCalled();
  });
});

describe("MyReportDetail", () => {
  it("shows the report's state and reason above its message thread", async () => {
    mocks.getMyReport.mockResolvedValue(report({ id: "r-9", status: "rejected", reason: "it is spam", video_title: "Clip" }));
    render(<MyReportDetail reportId="r-9" />);

    expect(await screen.findByText("it is spam")).toBeTruthy();
    expect(screen.getByText("Rejected")).toBeTruthy();
    expect(await screen.findByRole("region", { name: "Messages about this report" })).toBeTruthy();
    expect(mocks.getReportMessages).toHaveBeenCalledWith("r-9", { limit: 100 }, expect.anything());
  });

  it("shows an error, not a thread, when the report cannot be loaded", async () => {
    mocks.getMyReport.mockRejectedValue(new Error("404"));
    render(<MyReportDetail reportId="nope" />);
    expect(await screen.findByText("Could not load this report.")).toBeTruthy();
    expect(mocks.getReportMessages).not.toHaveBeenCalled();
  });
});
