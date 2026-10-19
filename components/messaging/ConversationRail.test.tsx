// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/messages", useRouter: () => ({ push: vi.fn() }) }));
const session = vi.hoisted(() => ({ user: { id: "me" } }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "authed", user: session.user }) }));
vi.mock("@/lib/messaging/availability", () => ({ useMessagingAvailable: () => true }));
vi.mock("@/lib/e2ee/availability", () => ({ useE2EEAvailable: () => false }));
vi.mock("@/lib/api", () => ({
  api: { getConversations: vi.fn() },
  userAvatarUrl: () => "/avatar.png",
  ApiError: class extends Error {},
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { api } from "@/lib/api";
import type { ConversationListResponse, ConversationSummary } from "@/lib/api";
import MessagesPage from "@/app/messages/page";
import { NewMessageButton } from "@/components/NewMessageButton";
import { ConversationRail } from "./ConversationRail";

beforeEach(() => {
  session.user = { id: "me" };
  vi.mocked(api.getConversations).mockReset();
  vi.mocked(api.getConversations).mockResolvedValue({ limit: 20, offset: 0, total: 1, conversations: [{
    id: "c1", other_user_id: "u2", other_username: "maya", other_display_name: "Maya Chen",
    encrypted: false, last_message_body: "Ready to review", unread_count: 123,
    updated_at: "2026-10-19T10:00:00Z", last_message_at: "2026-10-19T10:00:00Z",
  }] });
});

const conversation = (n: number): ConversationSummary => ({
  id: `c${n}`, other_user_id: `u${n}`, other_username: `friend${n}`, other_display_name: `Friend ${n}`,
  encrypted: false, last_message_body: `Preview ${n}`, unread_count: 0,
  updated_at: new Date(Date.UTC(2026, 9, 19, 12, 0, 60 - n)).toISOString(),
  last_message_at: "2026-10-19T12:00:00Z",
});
const firstPage = Array.from({ length: 20 }, (_, i) => conversation(i + 1));
const page = (conversations: ConversationSummary[], offset = 0, total = 21): ConversationListResponse =>
  ({ conversations, limit: 20, offset, total });

describe("conversation pagination", () => {
  it("loads older conversations and explains search covers only loaded rows", async () => {
    vi.mocked(api.getConversations).mockResolvedValueOnce(page(firstPage)).mockResolvedValueOnce(page([conversation(21)], 20));
    render(<ConversationRail titleAsH1 />);
    const search = await screen.findByRole("searchbox", { name: "Search conversations" });
    fireEvent.change(search, { target: { value: "Friend 21" } });
    expect(screen.getByText(/Searching loaded conversations/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more conversations" }));
    expect(await screen.findByText("Friend 21")).toBeTruthy();
    expect(api.getConversations).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    expect(screen.queryByRole("button", { name: "Load more conversations" })).toBeNull();
    expect(screen.queryByText(/Searching loaded conversations/)).toBeNull();
  });

  it("keeps loaded older rows after a failed page and a first-page poll", async () => {
    const get = vi.mocked(api.getConversations);
    get.mockResolvedValueOnce(page(firstPage)).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([conversation(21)], 20));
    render(<ConversationRail titleAsH1 />);
    const more = await screen.findByRole("button", { name: "Load more conversations" });
    fireEvent.click(more);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not load more conversations.");
    expect(screen.getByText("Friend 20")).toBeTruthy();
    fireEvent.click(more);
    await screen.findByText("Friend 21");
    const updated = { ...conversation(20), updated_at: "2026-10-19T13:00:00Z", last_message_body: "New reply" };
    get.mockResolvedValueOnce(page([updated, ...firstPage.slice(0, 19)]));
    fireEvent.focus(window);
    await screen.findByText("New reply");
    expect(screen.getByText("Friend 21")).toBeTruthy();
    const rows = screen.getAllByRole("link").filter(link => link.getAttribute("href")?.startsWith("/messages/"));
    expect(rows).toHaveLength(21);
    expect(rows[0].textContent).toContain("Friend 20");
    expect(screen.queryByRole("button", { name: "Load more conversations" })).toBeNull();
  });

  it("clears the previous account's rows and ignores its late poll on account switch", async () => {
    const get = vi.mocked(api.getConversations);
    const view = render(<ConversationRail titleAsH1 />);
    await screen.findByText("Maya Chen");
    let finishPoll!: (value: ConversationListResponse) => void;
    get.mockImplementationOnce(() => new Promise(resolve => { finishPoll = resolve; }));
    fireEvent.focus(window);
    get.mockResolvedValueOnce(page([conversation(2)], 0, 1));
    session.user = { id: "another-account" };
    view.rerender(<ConversationRail titleAsH1 />);
    expect(screen.queryByText("Maya Chen")).toBeNull();
    await screen.findByText("Friend 2");
    await act(async () => finishPoll(page([{ ...conversation(1), other_display_name: "Private from A" }])));
    await waitFor(() => expect(screen.queryByText("Private from A")).toBeNull());
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("messaging discovery", () => {
  it("shows a visible New message action that opens the compose dialog", () => {
    render(<NewMessageButton />);
    const trigger = screen.getByRole("button", { name: "New message" });
    expect(trigger.textContent).toBe("New message");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "New message" })).toBeTruthy();
  });

  it("starts a conversation directly from the empty desktop pane", () => {
    render(<MessagesPage />);
    expect(screen.getByText("Your messages")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start a conversation" }));
    expect(screen.getByRole("dialog", { name: "New message" })).toBeTruthy();
  });

  it("clears an unmatched search and returns focus to the search field", async () => {
    render(<ConversationRail titleAsH1 />);
    const search = await screen.findByRole("searchbox", { name: "Search conversations" });
    fireEvent.change(search, { target: { value: "nobody" } });
    expect(screen.getByText(/No conversations match/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect((search as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(search);
    expect(screen.getByText("Maya Chen")).toBeTruthy();
  });

  it("shows a capped numeric unread badge while announcing the full count", async () => {
    render(<ConversationRail titleAsH1 />);
    expect((await screen.findByLabelText("123 unread messages")).textContent).toBe("99+");
  });
});
