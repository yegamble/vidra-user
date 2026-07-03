import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CryptoAccount, CryptoProvider } from "./crypto";
import { E2EEEngine, MIN_ONE_TIME_KEYS, OTK_UPLOAD_BATCH } from "./engine";
import type { ClaimedDevice } from "./envelope";
import type { E2EEStore, StoredDevice } from "./store";

// A deterministic fake Olm account — the crypto seam the engine talks to. It
// records nothing secret; encrypt/decrypt are trivial so the engine's
// orchestration (register → upload OTKs → persist; replenish threshold; fan-out)
// can be tested in Node without the WASM runtime.
class FakeAccount implements CryptoAccount {
  readonly identityKey = "idk-self";
  readonly signingKey = "sgk-self";
  fingerprint(): string {
    return this.signingKey;
  }
  generateOneTimeKeys(count: number) {
    return Array.from({ length: count }, (_, i) => ({ key_id: `k${i}`, key: `otk${i}` }));
  }
  encryptFor(device: ClaimedDevice, plaintext: string) {
    if (!device.one_time_key) return null;
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
  async load() {
    return this.record;
  }
  async save(device: StoredDevice) {
    this.record = device;
  }
  async clear() {
    this.record = null;
  }
}

const provider: CryptoProvider = {
  create: async () => new FakeAccount(),
  restore: async () => new FakeAccount(),
};

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

  it("encryptMessage fans out to the peer's devices and the caller's OTHER devices", async () => {
    store.record = {
      deviceId: "mine-1",
      deviceName: "Laptop",
      pickle: "{pickle}",
      pickleKey: "pk",
    };
    const peerClaim: ClaimedDevice = {
      device_id: "peer-1",
      identity_key: "idk-peer",
      signing_key: "sgk-peer",
      one_time_key: { key_id: "k", key: "otk" },
    };
    const myOtherClaim: ClaimedDevice = {
      device_id: "mine-2",
      identity_key: "idk-mine-2",
      signing_key: "sgk-mine-2",
      one_time_key: { key_id: "k", key: "otk" },
    };
    route((url) => {
      if (url.endsWith("/users/u-peer/e2ee/claim")) {
        return json({ user_id: "u-peer", claims: [peerClaim] });
      }
      if (url.endsWith("/users/u-me/e2ee/claim")) {
        // Includes my current device (mine-1) which must be excluded from fan-out.
        return json({
          user_id: "u-me",
          claims: [myOtherClaim, { ...peerClaim, device_id: "mine-1" }],
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await engine.encryptMessage("u-peer", "u-me", "hello");
    expect(result.sender_device_id).toBe("mine-1");
    expect(result.envelopes.map((e) => e.recipient_device_id).sort()).toEqual(["mine-2", "peer-1"]);
    expect(result.skipped).toEqual([]);
  });
});
