// The E2EE engine orchestrates the client crypto (CryptoProvider) with the
// backend key directory + ciphertext store (the api client). Only the CRYPTO is
// stubbable (getCryptoProvider); the API calls are real, so mocked Playwright
// runs exercise the full setup/fan-out/read orchestration and the wire contract
// while faking only the Olm math.

import { api } from "@/lib/api";
import type { EncryptedMessage } from "@/lib/api";

import { type CryptoAccount, type CryptoProvider, getCryptoProvider, randomPickleKey } from "./crypto";
import { type ClaimedDevice, type OneTimeKey, fanOutEncrypt } from "./envelope";
import { type E2EEStore, type OwnMessageRecord } from "./store";
import { accountStore } from "./account-store";
import { captureE2EESession, onE2EESessionChange } from "./session";

export type { OwnMessageRecord } from "./store";

/** Keep at least this many unclaimed one-time keys on the backend per device. */
export const MIN_ONE_TIME_KEYS = 20;
/** Refill target when replenishing (sits comfortably above the floor). */
export const OTK_UPLOAD_BATCH = 30;

export class PeerNotReadyError extends Error {
  readonly name = "PeerNotReadyError";
  constructor(readonly skipped: string[] = []) {
    super("The other person is not ready to receive encrypted messages yet.");
  }
}

/** The caller's own registered device, as surfaced to the UI. */
export interface LocalDevice {
  device_id: string;
  device_name: string;
  fingerprint: string;
}

/** A device fingerprint (safety number source) for verification display. */
export interface DeviceFingerprint {
  device_id: string;
  device_name: string;
  fingerprint: string;
}

/** The encrypted send request body the composer posts. */
export interface EncryptResult {
  sender_device_id: string;
  envelopes: { recipient_device_id: string; message_type: 0 | 1; ciphertext: string }[];
  /** Recipient devices that could not be reached (no session, no prekeys left). */
  skipped: string[];
}

interface Loaded {
  account: CryptoAccount;
  deviceId: string;
  deviceName: string;
  pickleKey: string;
  pendingOneTimeKeys?: OneTimeKey[];
}

export class E2EEEngine {
  private loaded: Loaded | null = null;
  private loading: Promise<Loaded | null> | null = null;
  private deviceWork: Promise<unknown> = Promise.resolve();
  // sender_device_id -> Curve25519 identity_key, for inbound decryption.
  private deviceIdentity = new Map<string, string>();

  constructor(
    private readonly provider: CryptoProvider,
    private readonly store: E2EEStore,
    private readonly assertSession: () => void = () => {},
  ) {}

  private async checked<T>(work: () => Promise<T>): Promise<T> {
    this.assertSession();
    const result = await work();
    this.assertSession();
    return result;
  }

  private queueDeviceWork<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.deviceWork.then(() => this.checked(work));
    this.deviceWork = pending.catch(() => {});
    return pending;
  }

  /** The current device if this browser has one set up, else null. */
  async currentDevice(): Promise<LocalDevice | null> {
    const loaded = await this.checked(() => this.ensureLoaded());
    if (!loaded?.deviceId || loaded.pendingOneTimeKeys?.length) return null;
    return {
      device_id: loaded.deviceId,
      device_name: loaded.deviceName,
      fingerprint: loaded.account.fingerprint(),
    };
  }

  private async ensureLoaded(): Promise<Loaded | null> {
    this.assertSession();
    if (this.loaded) return this.loaded;
    return this.loading ??= this.restore().finally(() => { this.loading = null; });
  }

  private async restore(): Promise<Loaded | null> {
    const record = await this.checked(() => this.store.load());
    if (!record) return null;
    const account = await this.checked(() => this.provider.restore(record.pickle, record.pickleKey));
    this.loaded = {
      account,
      deviceId: record.deviceId,
      deviceName: record.deviceName,
      pickleKey: record.pickleKey,
      pendingOneTimeKeys: record.pendingOneTimeKeys,
    };
    return this.loaded;
  }

  private async persist(): Promise<void> {
    const loaded = this.loaded;
    if (!loaded) return;
    try {
      await this.checked(() => this.store.save({
        deviceId: loaded.deviceId,
        deviceName: loaded.deviceName,
        pickle: loaded.account.serialize(loaded.pickleKey),
        pickleKey: loaded.pickleKey,
        pendingOneTimeKeys: loaded.pendingOneTimeKeys,
      }));
    } catch (err) {
      this.reset(); // A failed write must never leave an apparently ready account.
      throw err;
    }
  }

  /**
   * setupDevice registers a fresh device on first encrypted use: create the Olm
   * account, publish its public identity/signing keys, upload a batch of one-time
   * prekeys, and persist the pickled account under a random pickle key.
   */
  setupDevice(name: string): Promise<LocalDevice> {
    return this.ensureDevice(name);
  }

  /** Serialized, retryable preparation; private state is durable before publication. */
  ensureDevice(name = "This browser"): Promise<LocalDevice> {
    return this.queueDeviceWork(async () => {
      let loaded = await this.checked(() => this.ensureLoaded());
      if (!loaded) {
        const account = await this.checked(() => this.provider.create());
        loaded = this.loaded = {
          account, deviceId: "", deviceName: name, pickleKey: randomPickleKey(),
          pendingOneTimeKeys: account.generateOneTimeKeys(OTK_UPLOAD_BATCH),
        };
        await this.persist();
      } else {
        const { devices } = await this.checked(() => api.listMyE2EEDevices());
        const current = loaded;
        const existing = devices.find((d) => (!current.deviceId || d.id === current.deviceId) &&
          d.identity_key === current.account.identityKey && d.signing_key === current.account.signingKey);
        if (loaded.deviceId && !existing) throw new Error("This encryption device was removed or its registered keys changed. Remove it locally in Settings → Devices before preparing a new device.");
        if (existing) loaded.deviceId = existing.id;
      }
      if (!loaded.deviceId) {
        const device = await this.checked(() => api.registerE2EEDevice({
          device_name: loaded.deviceName, identity_key: loaded.account.identityKey,
          signing_key: loaded.account.signingKey,
        }));
        loaded.deviceId = device.id;
      }
      await this.persist();
      await this.publishPendingKeys(loaded);
      return { device_id: loaded.deviceId, device_name: loaded.deviceName, fingerprint: loaded.account.fingerprint() };
    });
  }

  private async publishPendingKeys(loaded: Loaded): Promise<void> {
    if (!loaded.pendingOneTimeKeys?.length) return;
    await this.checked(() => api.uploadE2EEOneTimeKeys(loaded.deviceId, loaded.pendingOneTimeKeys!));
    loaded.pendingOneTimeKeys = undefined;
    await this.persist();
  }

  /**
   * replenishOneTimeKeys tops the device's unclaimed prekeys back up to the
   * batch size whenever they dip below MIN_ONE_TIME_KEYS (each conversation a
   * peer starts consumes one). A no-op when the floor is already met.
   */
  replenishOneTimeKeys(): Promise<void> {
    return this.queueDeviceWork(async () => {
      const loaded = await this.checked(() => this.ensureLoaded());
      if (!loaded?.deviceId) return;
      await this.publishPendingKeys(loaded);
      const { count } = await this.checked(() => api.countE2EEOneTimeKeys(loaded.deviceId));
      if (count >= MIN_ONE_TIME_KEYS) return;
      loaded.pendingOneTimeKeys = loaded.account.generateOneTimeKeys(OTK_UPLOAD_BATCH - count);
      await this.persist();
      await this.publishPendingKeys(loaded);
    });
  }

  /**
   * encryptMessage fans one plaintext out to every recipient device AND to the
   * caller's OWN OTHER devices, and returns the send body. The caller's current
   * device is excluded (it wrote the plaintext).
   *
   * Device discovery is a READ-ONLY directory lookup, and that distinction is
   * the whole point of this method's shape. Claiming is destructive: the backend
   * claims one single-use prekey for EVERY device of the target user, with no
   * way to ask for a subset (POST /users/{id}/e2ee/claim takes no body and no
   * filter). Claiming on every send therefore burned one of the peer's prekeys
   * per device per message — roughly thirty messages drained a peer's pool,
   * after which a genuinely NEW device could no longer start a session with
   * them. An established outbound session needs no key at all (encryptFor reuses
   * it and ignores anything handed to it), so we look the devices up first and
   * claim only for a user who has at least one device we cannot already reach.
   */
  async encryptMessage(
    recipientUserId: string,
    myUserId: string,
    plaintext: string,
  ): Promise<EncryptResult> {
    const loaded = await this.checked(() => this.ensureLoaded());
    if (!loaded?.deviceId || loaded.pendingOneTimeKeys?.length) throw new Error("no E2EE device is set up");

    // Neither of these consumes a prekey.
    const [peerDir, myDir] = await Promise.all([
      this.checked(() => api.listUserE2EEDevices(recipientUserId)),
      this.checked(() => api.listMyE2EEDevices()),
    ]);
    this.assertSession();
    const peerDevices = peerDir.devices;
    if (peerDevices.length === 0) throw new PeerNotReadyError();
    const myDevices = myDir.devices.filter((d) => d.id !== loaded.deviceId);
    // Remember every device's identity key so we can decrypt their replies.
    for (const d of [...peerDevices, ...myDevices]) {
      this.deviceIdentity.set(d.id, d.identity_key);
    }

    // Claim is all-or-nothing per USER, so this is the finest granularity the
    // contract allows: a user with a device we cannot reach costs one claim,
    // a user we can already reach entirely costs none.
    const unreachable = (d: { identity_key: string }) =>
      !loaded.account.hasOutboundSession(d.identity_key);
    const [peerClaims, myClaims] = await Promise.all([
      peerDevices.some(unreachable) ? this.checked(() => api.claimE2EEOneTimeKeys(recipientUserId)) : null,
      myDevices.some(unreachable) ? this.checked(() => api.claimE2EEOneTimeKeys(myUserId)) : null,
    ]);
    this.assertSession();
    const claimedKey = new Map<string, OneTimeKey | null>();
    for (const c of [...(peerClaims?.claims ?? []), ...(myClaims?.claims ?? [])]) {
      claimedKey.set(c.device_id, c.one_time_key);
    }

    // A device we already have a session with carries no key — encryptFor takes
    // the session path. A device with neither is unreachable and lands in
    // `skipped`, which the composer reports rather than swallowing.
    const targets: ClaimedDevice[] = [...peerDevices, ...myDevices].map((d) => ({
      device_id: d.id,
      identity_key: d.identity_key,
      signing_key: d.signing_key,
      one_time_key: claimedKey.get(d.id) ?? null,
    }));

    const { envelopes, skipped } = fanOutEncrypt({
      encryptor: loaded.account,
      targets,
      plaintext,
    });
    await this.persist();
    if (!envelopes.some((env) => peerDevices.some((d) => d.id === env.recipient_device_id))) {
      throw new PeerNotReadyError(skipped);
    }
    return { sender_device_id: loaded.deviceId, envelopes, skipped };
  }

  /**
   * decryptEnvelope decrypts one stored envelope addressed to this device.
   * Throws on an undecryptable message (a missing session, a device that can't
   * read history) — the caller renders a per-message "undecryptable" state.
   */
  async decryptEnvelope(env: EncryptedMessage): Promise<string> {
    const loaded = await this.checked(() => this.ensureLoaded());
    if (!loaded) throw new Error("no E2EE device is set up");
    // Olm messages are one-shot decryptable: a pre-key/ratchet message consumes
    // its one-time key and ratchets the session past it, so it can only be
    // decrypted ONCE. Thread reloads re-fetch every envelope, so return the
    // cached plaintext for an envelope we've already decrypted instead of trying
    // (and failing) to decrypt it again.
    const cached = await this.checked(() => this.store.loadPlaintext(env.id));
    if (cached !== null) return cached;
    const identityKey = await this.checked(() => this.identityKeyFor(env.sender_user_id, env.sender_device_id));
    const plaintext = loaded.account.decryptFrom(identityKey, env.message_type, env.ciphertext);
    // Persist the ratcheted session BEFORE caching the plaintext, so a crash
    // between the two never loses the session that produced it.
    await this.persist();
    await this.checked(() => this.store.savePlaintext(env.id, plaintext));
    return plaintext;
  }

  /**
   * recordOwnMessage remembers a message this device just sent. encryptMessage
   * deliberately excludes the sending device from the fan-out, and the backend
   * returns only envelopes addressed to the caller's devices — so a sender gets
   * NOTHING of its own back from the wire. Call this after the send is accepted;
   * without it, every remount of the thread drops our half of the conversation.
   */
  async recordOwnMessage(rec: OwnMessageRecord): Promise<void> {
    await this.checked(() => this.store.saveOwnMessage(rec));
  }

  /**
   * ownMessages returns what this device sent in a conversation, oldest→newest,
   * with expired disappearing messages dropped — mirroring the server, which
   * filters expired envelopes out of every list response.
   */
  async ownMessages(conversationId: string): Promise<OwnMessageRecord[]> {
    const now = Date.now();
    const records = await this.checked(() => this.store.listOwnMessages(conversationId));
    return records
      .filter((r) => r.expires_at === undefined || new Date(r.expires_at).getTime() > now)
      .sort((a, b) => {
        const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (t !== 0) return t;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  }

  private async identityKeyFor(userId: string, deviceId: string): Promise<string> {
    const cached = this.deviceIdentity.get(deviceId);
    if (cached) return cached;
    const { devices } = await this.checked(() => api.listUserE2EEDevices(userId));
    for (const d of devices) this.deviceIdentity.set(d.id, d.identity_key);
    const found = this.deviceIdentity.get(deviceId);
    if (!found) throw new Error("unknown sender device");
    return found;
  }

  /** The caller's own device fingerprint (safety number source), if set up. */
  async localFingerprint(): Promise<DeviceFingerprint | null> {
    const device = await this.checked(() => this.currentDevice());
    if (!device) return null;
    return {
      device_id: device.device_id,
      device_name: device.device_name,
      fingerprint: device.fingerprint,
    };
  }

  /** A peer's device fingerprints (from their published signing keys). */
  async peerFingerprints(userId: string): Promise<DeviceFingerprint[]> {
    const { devices } = await this.checked(() => api.listUserE2EEDevices(userId));
    return devices.map((d) => ({
      device_id: d.id,
      device_name: d.device_name,
      fingerprint: d.signing_key,
    }));
  }

  /** Forget the current in-memory account (e.g. after deleting this device). */
  reset(): void {
    this.loaded?.account.dispose();
    this.loaded = null;
    this.deviceIdentity.clear();
  }

  /**
   * forgetDevice clears the pickled account from device storage AND the
   * in-memory session — call after deleting THIS browser's device so the next
   * encrypted use runs a fresh setup.
   */
  async forgetDevice(): Promise<void> {
    this.reset();
    await this.checked(() => this.store.clear());
  }
}

let engineSingleton: Promise<E2EEEngine> | null = null;
onE2EESessionChange(() => {
  const previous = engineSingleton;
  engineSingleton = null;
  void previous?.then((engine) => engine.reset(), () => {});
});

/** One in-flight engine per authenticated session, including its local history. */
export async function getEngine(): Promise<E2EEEngine> {
  const session = captureE2EESession();
  if (!engineSingleton) {
    const loading = (async () => {
      const provider = await getCryptoProvider();
      session.assertCurrent();
      const store = await accountStore(session.userId, provider, session.assertCurrent);
      session.assertCurrent();
      return new E2EEEngine(provider, store, session.assertCurrent);
    })();
    engineSingleton = loading;
    void loading.catch(() => {
      if (engineSingleton === loading) engineSingleton = null;
    });
  }
  const engine = await engineSingleton;
  session.assertCurrent();
  return engine;
}

/** Test seam: drop the cached singleton so a new provider/store can be wired. */
export function __resetEngineSingletonForTest(): void {
  engineSingleton = null;
}
