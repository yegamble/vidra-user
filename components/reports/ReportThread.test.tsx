// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReportMessage } from "@/lib/api";

import { ReportThread } from "./ReportThread";

const mocks = vi.hoisted(() => ({
  getReportMessages: vi.fn(),
  postReportMessage: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { getReportMessages: mocks.getReportMessages, postReportMessage: mocks.postReportMessage },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

function msg(over: Partial<ReportMessage>): ReportMessage {
  return {
    id: "m-1",
    body: "hello",
    by_moderator: false,
    is_mine: false,
    created_at: "2026-10-01T12:00:00Z",
    ...over,
  };
}

function thread(messages: ReportMessage[], canReply = true) {
  return { messages, can_reply: canReply, total: messages.length, limit: 100, offset: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("ReportThread", () => {
  it("shows the reporter their own messages as theirs and staff ones as an unnamed moderator", async () => {
    mocks.getReportMessages.mockResolvedValue(
      thread([
        msg({ id: "a", body: "more context", is_mine: true }),
        msg({ id: "b", body: "which part?", by_moderator: true }),
      ]),
    );
    render(<ReportThread reportId="r-1" viewer="reporter" />);

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("You");
    expect(items[1].textContent).toContain("Moderator");
    expect(mocks.getReportMessages).toHaveBeenCalledWith("r-1", { limit: 100, offset: 0 }, expect.anything());
  });

  it("names authors for staff", async () => {
    mocks.getReportMessages.mockResolvedValue(
      thread([msg({ id: "a", body: "x", author_username: "bob" }), msg({ id: "b", by_moderator: true, author_username: "mia" })]),
    );
    render(<ReportThread reportId="r-1" viewer="staff" />);
    const items = await screen.findAllByRole("listitem");
    expect(items[0].textContent).toContain("bob");
    expect(items[0].textContent).toContain("Reporter");
    expect(items[1].textContent).toContain("mia");
  });

  it("renders a message body as plain text, never as HTML", async () => {
    mocks.getReportMessages.mockResolvedValue(
      thread([msg({ body: '<img src=x onerror="alert(1)"><b>bold</b> [link](javascript:alert(1))' })]),
    );
    const { container } = render(<ReportThread reportId="r-1" viewer="staff" />);
    await screen.findByText(/<img src=x/);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("posts a trimmed message and appends it to the thread", async () => {
    mocks.getReportMessages.mockResolvedValue(thread([]));
    mocks.postReportMessage.mockResolvedValue(msg({ id: "new", body: "thanks", is_mine: true }));
    render(<ReportThread reportId="r-1" viewer="reporter" />);

    await screen.findByText(/no messages yet/i);
    const box = screen.getByLabelText("Message");
    const send = screen.getByRole("button", { name: "Send" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "  thanks  " } });
    fireEvent.click(send);

    await waitFor(() => expect(mocks.postReportMessage).toHaveBeenCalledWith("r-1", "thanks"));
    expect(await screen.findByText("thanks")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps the draft and says so when sending fails", async () => {
    mocks.getReportMessages.mockResolvedValue(thread([]));
    mocks.postReportMessage.mockRejectedValue(new Error("boom"));
    render(<ReportThread reportId="r-1" viewer="reporter" />);
    const box = await screen.findByLabelText("Message");
    fireEvent.change(box, { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Could not send your message.")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("draft");
  });

  // The thread is oldest first, so stopping at one page would hide exactly the
  // NEWEST messages — the ones a reply is about. It walks every page.
  it("loads every page of a long thread, so the newest messages are shown", async () => {
    const all = Array.from({ length: 150 }, (_, i) => msg({ id: `m-${i}`, body: `message ${i + 1}` }));
    mocks.getReportMessages.mockImplementation((_id: string, w: { limit: number; offset: number }) =>
      Promise.resolve({ ...thread(all.slice(w.offset, w.offset + w.limit)), total: all.length }),
    );
    render(<ReportThread reportId="r-1" viewer="staff" />);
    expect(await screen.findByText("message 150")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(150);
    expect(mocks.getReportMessages).toHaveBeenCalledWith("r-1", { limit: 100, offset: 100 }, expect.anything());
  });

  it("explains a read-only thread instead of offering a composer", async () => {
    mocks.getReportMessages.mockResolvedValue(thread([], false));
    render(<ReportThread reportId="r-1" viewer="staff" />);
    expect(await screen.findByText(/another instance/i)).toBeTruthy();
    expect(screen.queryByLabelText("Message")).toBeNull();
  });
});
