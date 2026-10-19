// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
};

vi.mock("@/lib/e2ee/engine", () => ({ getEngine: async () => engine }));
vi.mock("@/lib/e2ee/prepare", () => ({ prepareDevice: async () => engine.currentDevice() }));

// jsdom has no layout, so the thread's scroll anchoring has nothing to call.
Element.prototype.scrollIntoView = () => {};

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
  vi.restoreAllMocks();
  __resetEncryptedDraftsForTest();
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
