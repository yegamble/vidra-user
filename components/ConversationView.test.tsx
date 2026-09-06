// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationView } from "./ConversationView";
import { MessageTimeline } from "./messaging/MessageTimeline";
import { api } from "@/lib/api";

vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "authed", user: { id: "me" } }) }));
vi.mock("@/components/e2ee/EncryptedThreadView", () => ({ EncryptedThreadView: () => null }));
vi.mock("@/components/messaging/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/messaging/ThreadHeader", () => ({ ThreadHeader: () => null }));
vi.mock("@/components/SignInGate", () => ({ SignInGate: () => null }));
vi.mock("@/components/messaging/MessageGroup", () => ({ MessageGroup: ({ run }: { run: { messages: { message: { id: string; body: string } }[] } }) => <>{run.messages.map(({ message }) => <p key={message.id}>{message.body}</p>)}</> }));
vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(), api: { getConversationMessages: vi.fn(), markConversationRead: vi.fn(async () => undefined) } }));
const getMessages = vi.mocked(api.getConversationMessages);
const message = (n: number) => ({ id: `m${n}`, conversation_id: "conversation", sender_id: "me", body: `message ${n}`, created_at: new Date(Date.UTC(2026, 8, 5, 0, 0, n)).toISOString() });
const firstPage = Array.from({ length: 100 }, (_, i) => message(100 - i));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("plaintext history", () => {
  it("pages from the oldest loaded ID, merges overlap once and stops on a short page", async () => {
    getMessages.mockResolvedValueOnce({ limit: 100, offset: 0, messages: firstPage }).mockResolvedValueOnce({ limit: 100, offset: 0, messages: [message(1), message(0)] });
    render(<ConversationView conversationId="conversation" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show earlier messages" }));
    await screen.findByText("message 0");
    expect(getMessages).toHaveBeenLastCalledWith("conversation", { limit: 100, before_id: "m1" });
    expect(screen.getAllByText("message 1")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Show earlier messages" })).toBeNull();
    const bodies = [...screen.getByRole("log").querySelectorAll("p")].map(p => p.textContent);
    expect(bodies.indexOf("message 0")).toBeLessThan(bodies.indexOf("message 1"));
    expect(bodies.indexOf("message 1")).toBeLessThan(bodies.indexOf("message 100"));
  });

  it("keeps loaded history and offers retry after a failed older-page request", async () => {
    getMessages.mockResolvedValueOnce({ limit: 100, offset: 0, messages: firstPage }).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ limit: 100, offset: 0, messages: [message(0)] });
    render(<ConversationView conversationId="conversation" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show earlier messages" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not load earlier messages.");
    expect(screen.getByText("message 100")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show earlier messages" }));
    await screen.findByText("message 0");
    expect(getMessages).toHaveBeenCalledTimes(3);
  });

  it("anchors a prepend even when the newest loaded message is mine, without counting history as new", async () => {
    let height = 2000;
    const props = { meId: "me", otherName: "Peer", onDeleted: vi.fn(), onRetry: vi.fn(), onDiscard: vi.fn(), onLoadEarlier: vi.fn(), hasEarlier: true };
    const { rerender } = render(<MessageTimeline {...props} messages={[message(1), message(2)]} />);
    const log = screen.getByRole("log");
    Object.defineProperty(log, "scrollHeight", { get: () => height });
    Object.defineProperty(log, "clientHeight", { value: 400 });
    log.scrollTop = 300; fireEvent.scroll(log);
    fireEvent.click(screen.getByRole("button", { name: "Show earlier messages" }));
    rerender(<MessageTimeline {...props} loadingEarlier messages={[message(1), message(2)]} />);
    height = 2600;
    rerender(<MessageTimeline {...props} messages={[message(0), message(1), message(2)]} />);
    await waitFor(() => expect(log.scrollTop).toBe(900));
    expect(screen.getByRole("button", { name: "Jump to latest" })).toBeTruthy();
  });
});
