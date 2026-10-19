import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { coordinateEngine } from "./coordination";
import type { CryptoAccount, CryptoProvider } from "./crypto";
import { E2EEEngine } from "./engine";
import type { ClaimedDevice } from "./envelope";
import type { E2EEStore, StoredDevice } from "./store";

class Account implements CryptoAccount {
  readonly identityKey = "self-identity";
  readonly signingKey = "self-signing";
  constructor(readonly sessions = new Set<string>()) {}
  fingerprint() { return this.signingKey; }
  generateOneTimeKeys() { return []; }
  hasOutboundSession(key: string) { return this.sessions.has(key); }
  encryptFor(device: ClaimedDevice, plaintext: string) {
    this.sessions.add(device.identity_key);
    return { message_type: 0 as const, ciphertext: plaintext };
  }
  decryptFrom() { return "decrypted"; }
  serialize() { return JSON.stringify([...this.sessions]); }
  dispose() {}
}

function fixture() {
  let record: StoredDevice | null = {
    deviceId: "self", deviceName: "Browser", pickleKey: "local", pickle: "[]",
  };
  const load = vi.fn(async () => record && { ...record });
  const store: E2EEStore = {
    load,
    save: async (next) => { record = { ...next }; },
    clear: async () => { record = null; },
    loadPlaintext: async () => null,
    savePlaintext: async () => {},
    saveOwnMessage: async () => {},
    listOwnMessages: async () => [],
  };
  const provider: CryptoProvider = {
    create: async () => new Account(),
    restore: async (pickle) => new Account(new Set(JSON.parse(pickle))),
  };
  return { load, store, engine: () => new E2EEEngine(provider, store) };
}

function device(id: string) {
  return {
    id, user_id: id, device_name: id, identity_key: `${id}-identity`,
    signing_key: `${id}-signing`, created_at: "2026-10-19", last_seen_at: "2026-10-19",
  };
}

function locks() {
  let tail = Promise.resolve();
  const request = vi.fn((_name: string, run: () => Promise<unknown>) => {
    const pending = tail.then(run);
    tail = pending.then(() => {}, () => {});
    return pending;
  });
  vi.stubGlobal("navigator", { locks: { request } });
  return request;
}

beforeEach(() => {
  vi.spyOn(api, "listUserE2EEDevices").mockImplementation(async (id) => ({ devices: [device(id)] }));
  vi.spyOn(api, "listMyE2EEDevices").mockResolvedValue({ devices: [device("self")] });
  vi.spyOn(api, "claimE2EEOneTimeKeys").mockImplementation(async (id) => ({ user_id: id, claims: [{
    device_id: id, identity_key: `${id}-identity`, signing_key: `${id}-signing`,
    one_time_key: { key_id: "key", key: "public-key" },
  }] }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([true, false])("preserves both engines' new sessions (Web Locks: %s)", async (webLocks) => {
  const request = webLocks ? locks() : undefined;
  if (!webLocks) vi.stubGlobal("navigator", {});
  const shared = fixture();
  const first = coordinateEngine(shared.engine(), "account", () => {});
  const second = coordinateEngine(shared.engine(), "account", () => {});
  // Both tabs have already cached the same old account before either sends.
  await first.currentDevice();
  await second.currentDevice();
  await Promise.all([
    first.encryptMessage("peer-a", "self", "hello A"),
    second.encryptMessage("peer-b", "self", "hello B"),
  ]);
  expect(JSON.parse((await shared.store.load())!.pickle).sort()).toEqual(["peer-a-identity", "peer-b-identity"]);
  if (request) expect(request.mock.calls.map(([name]) => name)).toEqual(Array(4).fill("vidra-e2ee:account"));
});

it("releases the lock after a failed operation", async () => {
  const request = locks();
  const shared = fixture();
  shared.load.mockRejectedValueOnce(new Error("storage unavailable"));
  const engine = coordinateEngine(shared.engine(), "account", () => {});
  await expect(engine.currentDevice()).rejects.toThrow("storage unavailable");
  expect(await engine.currentDevice()).toMatchObject({ device_id: "self" });
  expect(request).toHaveBeenCalledTimes(2);
});

it("rejects a session changed while queued before touching its account", async () => {
  locks();
  const shared = fixture();
  let release!: (value: StoredDevice | null) => void;
  shared.load.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  let current = true;
  const assert = () => { if (!current) throw new Error("account changed"); };
  const engine = coordinateEngine(shared.engine(), "account", assert);
  const active = engine.currentDevice();
  await vi.waitFor(() => expect(shared.load).toHaveBeenCalledTimes(1));
  const queued = engine.currentDevice();
  const settled = Promise.allSettled([active, queued]);
  current = false;
  release(null);
  expect((await settled).map((result) => result.status)).toEqual(["rejected", "rejected"]);
  expect(shared.load).toHaveBeenCalledTimes(1);
});

it("does not reacquire the lock for internal calls or synchronous reset", async () => {
  const request = locks();
  const shared = fixture();
  const engine = coordinateEngine(shared.engine(), "account", () => {});
  await engine.setupDevice("Browser"); // Calls ensureDevice internally.
  expect(await engine.localFingerprint()).toMatchObject({ device_id: "self" }); // Calls currentDevice.
  engine.reset();
  expect(request).toHaveBeenCalledTimes(2);
});
