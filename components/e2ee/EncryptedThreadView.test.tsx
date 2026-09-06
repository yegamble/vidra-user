// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EncryptedThreadView } from "./EncryptedThreadView";
import type { EncryptedMessage } from "@/lib/api";

// The list endpoint returns every envelope addressed to ANY of the caller's
// devices (see vidra-core ListE2EEMessagesForRecipient), so a two-device account
// receives its own peers' fan-out twice: once for this device and once for the
// other one. Only the crypto is faked here; the component's own filtering,
// ordering and placeholder logic is real.
const MINE = "device-this";
const OTHER = "device-mine-other";

const decryptable = new Map<string, string>();
const engine = {
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
