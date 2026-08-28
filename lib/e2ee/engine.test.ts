import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";

import type { CryptoAccount, CryptoProvider } from "./crypto";
import { E2EEEngine, MIN_ONE_TIME_KEYS, OTK_UPLOAD_BATCH } from "./engine";
import type { ClaimedDevice } from "./envelope";
import type { E2EEStore, OwnMessageRecord, StoredDevice } from "./store";

// A deterministic fake Olm account — the crypto seam the engine talks to. It
// records nothing secret; encrypt/decrypt are trivial so the engine's
// orchestration (register → upload OTKs → persist; replenish threshold; fan-out)
// can be tested in Node without the WASM runtime.
class FakeAccount implements CryptoAccount {
  readonly identityKey = "idk-self";
  readonly signingKey = "sgk-self";
  // Peer identity keys we hold an outbound session with — the fake's stand-in for
  // Olm's session map. Establishing one consumes the claimed key exactly once,
  // which is what makes "claim only when there is no session" observable.
  readonly sessions = new Set<string>();
  fingerprint(): string {
    return this.signingKey;
  }
  generateOneTimeKeys(count: number) {
    return Array.from({ length: count }, (_, i) => ({ key_id: `k${i}`, key: `otk${i}` }));
  }
  hasOutboundSession(identityKey: string) {
    return this.sessions.has(identityKey);
  }
  encryptFor(device: ClaimedDevice, plaintext: string) {
    if (!this.sessions.has(device.identity_key)) {
      if (!device.one_time_key) return null;
      this.sessions.add(device.identity_key);
    }
    return { message_type: 0 as const, ciphertext: `${device.device_id}:${plaintext}` };
  }
  decryptFrom() {
    return "plaintext";
  }
  serialize() {
    return "{pickle}";
  }
  dispose() {}
}

class MemStore implements E2EEStore {
  record: StoredDevice | null = null;
  plaintexts = new Map<string, string>();
  // Mirrors the IndexedDB `outbox` store: keyed by "<conversationId> <id>".
  own = new Map<string, OwnMessageRecord>();
  async load() {
    return this.record;
  }
  async save(device: StoredDevice) {
    this.record = device;
  }
  async clear() {
    this.record = null;
    this.plaintexts.clear();
    this.own.clear();
  }
  async loadPlaintext(envelopeId: string) {
    return this.plaintexts.get(envelopeId) ?? null;
  }
  async savePlaintext(envelopeId: string, plaintext: string) {
    this.plaintexts.set(envelopeId, plaintext);
  }
  async saveOwnMessage(rec: OwnMessageRecord) {
    this.own.set(`${rec.conversationId} ${rec.id}`, rec);
  }
  async listOwnMessages(conversationId: string) {
    return [...this.own.values()].filter((r) => r.conversationId === conversationId);
  }
}

const provider: CryptoProvider = {
  create: async () => new FakeAccount(),
  restore: async () => new FakeAccount(),
};

/** One row of a device-directory response (E2EEDevice on the wire). */
function device(id: string, userId: string, suffix: string) {
  return {
    id,
    user_id: userId,
    device_name: id,
    identity_key: `idk-${suffix}`,
    signing_key: `sgk-${suffix}`,
    created_at: "t",
    last_seen_at: "t",
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("E2EEEngine", () => {
  let store: MemStore;
  let engine: E2EEEngine;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new MemStore();
    engine = new E2EEEngine(provider, store);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function route(handler: (url: string, init: RequestInit) => Response) {
    fetchMock.mockImplementation((url: string, init: RequestInit = {}) =>
      Promise.resolve(handler(url, init)),
    );
  }

  function bodyOf(call: number): unknown {
    const init = fetchMock.mock.calls[call][1] as RequestInit;
    return JSON.parse(init.body as string);
  }

  it("setupDevice registers keys, uploads a full OTK batch, and persists the device", async () => {
    route((url) => {
      if (url.endsWith("/e2ee/devices")) {
        return json({
          id: "dev-1",
          user_id: "u1",
          device_name: "Laptop",
          identity_key: "idk-self",
          signing_key: "sgk-self",
          created_at: "t",
          last_seen_at: "t",
        });
      }
      if (url.endsWith("/one-time-keys")) return json({ unclaimed: OTK_UPLOAD_BATCH });
      throw new Error(`unexpected ${url}`);
    });

    const device = await engine.setupDevice("Laptop");
    expect(device).toEqual({ device_id: "dev-1", device_name: "Laptop", fingerprint: "sgk-self" });

    // register call carried the public keys…
    expect(bodyOf(0)).toEqual({
      device_name: "Laptop",
      identity_key: "idk-self",
      signing_key: "sgk-self",
    });
    // …and a full batch of one-time keys was uploaded.
    const upload = bodyOf(1) as { one_time_keys: unknown[] };
    expect(upload.one_time_keys).toHaveLength(OTK_UPLOAD_BATCH);

    // The pickled device is persisted (device-bound storage).
    expect(store.record?.deviceId).toBe("dev-1");
    expect(store.record?.pickle).toBe("{pickle}");
    expect(store.record?.pickleKey).toBeTruthy();
  });

  it("replenishOneTimeKeys tops up only when below the floor", async () => {
    store.record = {
      deviceId: "dev-1",
      deviceName: "Laptop",
      pickle: "{pickle}",
      pickleKey: "pk",
    };

    // Below the floor → uploads enough to refill to the batch size.
    let count = 5;
    route((url) => {
      if (url.endsWith("/one-time-keys/count")) return json({ count });
      if (url.endsWith("/one-time-keys")) return json({ unclaimed: OTK_UPLOAD_BATCH });
      throw new Error(`unexpected ${url}`);
    });
    await engine.replenishOneTimeKeys();
    const upload = bodyOf(1) as { one_time_keys: unknown[] };
    expect(upload.one_time_keys).toHaveLength(OTK_UPLOAD_BATCH - 5);

    // At/above the floor → no upload happens.
    fetchMock.mockClear();
    count = MIN_ONE_TIME_KEYS;
    await engine.replenishOneTimeKeys();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the count check
  });

  describe("encryptMessage", () => {
    // The directory rows the read-only device lookups return. `device_id` here is
    // `id` on the wire — E2EEDevice, not E2EEClaim.
    const peerDevice = device("peer-1", "u-peer", "peer");
    const myOtherDevice = device("mine-2", "u-me", "mine-2");
    const myCurrentDevice = device("mine-1", "u-me", "self");

    // Counts every destructive claim so a test can assert one was NOT made.
    let claims: string[];

    function routeDirectoryAndClaims(opts: { peer?: unknown[]; mine?: unknown[] } = {}) {
      const peers = opts.peer ?? [peerDevice];
      const mine = opts.mine ?? [myOtherDevice, myCurrentDevice];
      route((url, init) => {
        if (url.includes("/users/u-peer/e2ee/devices")) return json({ devices: peers });
        // The caller's own devices come from the self-scoped listing.
        if (url.endsWith("/api/v1/e2ee/devices") && (init.method ?? "GET") === "GET") {
          return json({ devices: mine });
        }
        const claim = /\/users\/([^/]+)\/e2ee\/claim$/.exec(url);
        if (claim) {
          const userId = claim[1];
          claims.push(userId);
          const devices = userId === "u-peer" ? peers : mine;
          return json({
            user_id: userId,
            claims: (devices as { id: string; identity_key: string; signing_key: string }[]).map(
              (d) => ({
                device_id: d.id,
                identity_key: d.identity_key,
                signing_key: d.signing_key,
                one_time_key: { key_id: "k", key: "otk" },
              }),
            ),
          });
        }
        throw new Error(`unexpected ${url}`);
      });
    }

    beforeEach(() => {
      claims = [];
      store.record = {
        deviceId: "mine-1",
        deviceName: "Laptop",
        pickle: "{pickle}",
        pickleKey: "pk",
      };
    });

    it("fans out to the peer's devices and the caller's OTHER devices", async () => {
      routeDirectoryAndClaims();
      const result = await engine.encryptMessage("u-peer", "u-me", "hello");
      expect(result.sender_device_id).toBe("mine-1");
      // mine-1 is this device — it wrote the plaintext and is excluded.
      expect(result.envelopes.map((e) => e.recipient_device_id).sort()).toEqual([
        "mine-2",
        "peer-1",
      ]);
      expect(result.skipped).toEqual([]);
    });

    // Claiming is destructive and unfilterable: the backend hands out one
    // single-use prekey for EVERY device of the target user. Claiming on every
    // send drained a peer's pool in ~30 messages, locking genuinely NEW devices
    // out of ever establishing a session. Once a session exists we need no key.
    it("does not claim again for a device it already has a session with", async () => {
      routeDirectoryAndClaims();

      await engine.encryptMessage("u-peer", "u-me", "first");
      expect(claims).toEqual(["u-peer", "u-me"]);

      // Second send over the SAME sessions: no prekey may be consumed.
      const second = await engine.encryptMessage("u-peer", "u-me", "second");
      expect(claims).toEqual(["u-peer", "u-me"]);
      expect(second.envelopes.map((e) => e.recipient_device_id).sort()).toEqual([
        "mine-2",
        "peer-1",
      ]);
      expect(second.skipped).toEqual([]);
    });

    it("claims again only for the user who added a device we cannot reach", async () => {
      routeDirectoryAndClaims();
      await engine.encryptMessage("u-peer", "u-me", "first");
      claims = [];

      // The peer adds a second device; nothing about our side changed.
      routeDirectoryAndClaims({ peer: [peerDevice, device("peer-2", "u-peer", "peer-2")] });
      const result = await engine.encryptMessage("u-peer", "u-me", "second");

      expect(claims).toEqual(["u-peer"]); // NOT u-me — every device of ours is reachable
      expect(result.envelopes.map((e) => e.recipient_device_id).sort()).toEqual([
        "mine-2",
        "peer-1",
        "peer-2",
      ]);
    });

    it("reports a device it cannot reach as skipped rather than dropping it", async () => {
      // The peer's pool is empty: the claim comes back with a null key and there
      // is no session to fall back on.
      route((url) => {
        if (url.includes("/users/u-peer/e2ee/devices")) return json({ devices: [peerDevice] });
        if (url.endsWith("/api/v1/e2ee/devices")) return json({ devices: [myCurrentDevice] });
        if (url.includes("/users/u-peer/e2ee/claim")) {
          return json({
            user_id: "u-peer",
            claims: [
              {
                device_id: "peer-1",
                identity_key: "idk-peer",
                signing_key: "sgk-peer",
                one_time_key: null,
              },
            ],
          });
        }
        throw new Error(`unexpected ${url}`);
      });

      const result = await engine.encryptMessage("u-peer", "u-me", "hello");
      expect(result.envelopes).toEqual([]);
      expect(result.skipped).toEqual(["peer-1"]);
    });
  });

  // The sending device is deliberately excluded from the fan-out (it wrote the
  // plaintext), and the backend only ever returns envelopes addressed to the
  // caller's OWN devices — so a sender's list-messages comes back EMPTY for
  // everything it sent. Without a local record of what we sent, every remount of
  // the thread loses our side of the conversation. These tests pin the outbox.
  describe("the sender's own messages", () => {
    const peerClaim: ClaimedDevice = {
      device_id: "peer-1",
      identity_key: "idk-peer",
      signing_key: "sgk-peer",
      one_time_key: { key_id: "k", key: "otk" },
    };

    function routeSendAndList() {
      route((url) => {
        if (url.includes("/users/u-peer/e2ee/devices")) {
          return json({ devices: [device("peer-1", "u-peer", "peer")] });
        }
        if (url.endsWith("/api/v1/e2ee/devices")) {
          return json({ devices: [device("mine-1", "u-me", "self")] });
        }
        if (url.includes("/users/u-peer/e2ee/claim")) {
          return json({ user_id: "u-peer", claims: [peerClaim] });
        }
        if (url.includes("/users/u-me/e2ee/claim")) return json({ user_id: "u-me", claims: [] });
        if (url.includes("/conversations/conv-1/messages")) {
          // Exactly what the server hands the SENDER back: nothing.
          return json({ envelopes: [], limit: 20, offset: 0 });
        }
        throw new Error(`unexpected ${url}`);
      });
    }

    beforeEach(() => {
      store.record = {
        deviceId: "mine-1",
        deviceName: "Laptop",
        pickle: "{pickle}",
        pickleKey: "pk",
      };
      routeSendAndList();
    });

    it("survive a remount even though the server returns the sender no envelopes", async () => {
      const sent = await engine.encryptMessage("u-peer", "u-me", "meet at noon");
      expect(sent.envelopes.length).toBeGreaterThan(0);
      await engine.recordOwnMessage({
        id: "m1",
        conversationId: "conv-1",
        text: "meet at noon",
        created_at: "2026-01-01T00:00:00.000Z",
        recipient_user_id: "u-peer",
      });

      // The server side of the story: the sender's own list is empty.
      const listed = await api.getConversationMessages("conv-1");
      expect("envelopes" in listed ? listed.envelopes : null).toEqual([]);

      // A FRESH engine over the SAME store is a page reload / thread remount.
      const reloaded = new E2EEEngine(provider, store);
      expect(await reloaded.ownMessages("conv-1")).toEqual([
        {
          id: "m1",
          conversationId: "conv-1",
          text: "meet at noon",
          created_at: "2026-01-01T00:00:00.000Z",
          recipient_user_id: "u-peer",
        },
      ]);
      // …and they stay scoped to their own conversation.
      expect(await reloaded.ownMessages("conv-2")).toEqual([]);
    });

    it("are returned oldest→newest with expired (disappearing) ones dropped", async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      const future = new Date(Date.now() + 60_000).toISOString();
      await engine.recordOwnMessage({
        id: "m2",
        conversationId: "conv-1",
        text: "second",
        created_at: "2026-01-01T00:00:02.000Z",
      });
      await engine.recordOwnMessage({
        id: "m1",
        conversationId: "conv-1",
        text: "first",
        created_at: "2026-01-01T00:00:01.000Z",
      });
      await engine.recordOwnMessage({
        id: "m3",
        conversationId: "conv-1",
        text: "gone",
        created_at: "2026-01-01T00:00:03.000Z",
        expires_at: past,
      });
      await engine.recordOwnMessage({
        id: "m4",
        conversationId: "conv-1",
        text: "still here",
        created_at: "2026-01-01T00:00:04.000Z",
        expires_at: future,
      });

      expect((await engine.ownMessages("conv-1")).map((r) => r.text)).toEqual([
        "first",
        "second",
        "still here",
      ]);
    });

    it("are wiped along with the device by forgetDevice", async () => {
      await engine.recordOwnMessage({
        id: "m1",
        conversationId: "conv-1",
        text: "meet at noon",
        created_at: "2026-01-01T00:00:00.000Z",
      });
      await engine.forgetDevice();
      expect(await engine.ownMessages("conv-1")).toEqual([]);
      expect(store.own.size).toBe(0);
    });
  });
});
