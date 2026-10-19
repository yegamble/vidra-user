// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EncryptedThreadView } from "./EncryptedThreadView";
import type { EncryptedMessage } from "@/lib/api";
import { api } from "@/lib/api";
import { __resetEncryptedDraftsForTest } from "@/lib/e2ee/drafts";

// The list endpoint returns every envelope addressed to ANY of the caller's
// devices (see vidra-core ListE2EEMessagesForRecipient), so a two-device account
// receives its own peers' fan-out twice: once for this device and once for the
// other one. Only the crypto is faked here; the component's own filtering,
// ordering and placeholder logic is real.
const MINE = "device-this";
const OTHER = "device-mine-other";

const decryptable = new Map<string, string>();
const engine = {
  encryptMessage: vi.fn(),
  currentDevice: vi.fn(async () => ({
    device_id: MINE,
    device_name: "this browser",
    fingerprint: "fp",
  })),
  replenishOneTimeKeys: vi.fn(async () => undefined),
  ownMessages: vi.fn(async () => []),
  decryptEnvelope: vi.fn(async (env: EncryptedMessage) => {
    const text = decryptable.get(env.id);
    if (text === undefined) throw new Error("no session for this envelope");
    return text;
  }),
  ensureDevice: vi.fn(async () => ({
    device_id: MINE,
    device_name: "this browser",
    fingerprint: "fp",
  })),
};

vi.mock("@/lib/e2ee/engine", () => ({ getEngine: async () => engine }));
vi.mock("@/lib/e2ee/prepare", () => ({ prepareDevice: async () => engine.currentDevice() }));

// jsdom has no layout, so the thread's scroll anchoring has nothing to call.
Element.prototype.scrollIntoView = () => {};
beforeEach(() => vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} })));

function envelope(over: Partial<EncryptedMessage> & { id: string }): EncryptedMessage {
  return {
    conversation_id: "conversation",
    sender_user_id: "peer",
    sender_device_id: "peer-device",
    recipient_device_id: MINE,
    message_type: 1,
    ciphertext: "opaque",
    created_at: "2026-09-06T12:00:00.000Z",
    ...over,
  } as EncryptedMessage;
}

afterEach(() => {
  cleanup();
  decryptable.clear();
  vi.clearAllMocks();
  engine.encryptMessage.mockReset();
  vi.restoreAllMocks();
  __resetEncryptedDraftsForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const view = (envelopes: EncryptedMessage[]) =>
  render(
    <EncryptedThreadView
      conversationId="conversation"
      envelopes={envelopes}
      recipientId="peer"
      myUserId="me"
    />,
  );

describe("EncryptedThreadView envelope addressing", () => {
  it("hides an expired encrypted message without waiting for another inbox poll", async () => {
    vi.useFakeTimers();
    decryptable.set("expires", "disappearing text");
    await act(async () => { view([envelope({ id: "expires", expires_at: new Date(Date.now() + 1000).toISOString() })]); });
    expect(screen.getByText("disappearing text")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.queryByText("disappearing text")).toBeNull();
  });
  it("supports Enter to send while preserving Shift+Enter and IME composition", async () => {
    engine.encryptMessage.mockRejectedValueOnce(new Error("offline"));
    view([]);
    const input = await screen.findByLabelText("Write an encrypted message");
    fireEvent.change(input, { target: { value: "keyboard message" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(engine.encryptMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(engine.encryptMessage).toHaveBeenCalledWith("peer", "me", "keyboard message"));
  });
  it("retains an unfinished secure draft when returning to the conversation", async () => {
    const first = view([]);
    fireEvent.change(await screen.findByLabelText("Write an encrypted message"), { target: { value: "unfinished private message" } });
    first.unmount();
    view([]);
    expect(await screen.findByLabelText("Write an encrypted message")).toHaveProperty("value", "unfinished private message");
  });

  it("keeps a draft and explains recipient readiness without posting a message", async () => {
    const error = new Error("not ready"); error.name = "PeerNotReadyError";
    engine.encryptMessage.mockRejectedValueOnce(error);
    const send = vi.spyOn(api, "sendEncryptedMessage");
    view([]);
    fireEvent.change(await screen.findByLabelText("Write an encrypted message"), { target: { value: "keep me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Waiting for the other person to sign in and prepare secure messaging. Your draft is saved here; try sending again when they are ready.");
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Write an encrypted message")).toHaveProperty("value", "keep me");
  });
  it("renders one bubble per message, not one per device the message was fanned out to", async () => {
    decryptable.set("to-me", "hello from the peer");
    // Newest first, as the API returns them: the same message addressed to this
    // device and to the caller's other device.
    view([
      envelope({ id: "to-my-other-device", recipient_device_id: OTHER }),
      envelope({ id: "to-me" }),
    ]);
    expect(await screen.findByText("hello from the peer")).toBeTruthy();
    expect(screen.queryByText(/can’t be decrypted on this device/)).toBeNull();
  });

  it("still flags an envelope addressed to THIS device that will not decrypt", async () => {
    view([envelope({ id: "to-me-broken" })]);
    expect(await screen.findByText(/can’t be decrypted on this device/)).toBeTruthy();
  });

  it("shows nothing rather than placeholders for history a later device was never addressed in", async () => {
    view([
      envelope({ id: "old-1", recipient_device_id: OTHER }),
      envelope({ id: "old-2", recipient_device_id: OTHER, sender_user_id: "me" }),
    ]);
    expect(await screen.findByText(/No messages yet/)).toBeTruthy();
    expect(screen.queryByText(/can’t be decrypted on this device/)).toBeNull();
  });
});
