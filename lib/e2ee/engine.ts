// The E2EE engine orchestrates the client crypto (CryptoProvider) with the
// backend key directory + ciphertext store (the api client). Only the CRYPTO is
// stubbable (getCryptoProvider); the API calls are real, so mocked Playwright
// runs exercise the full setup/fan-out/read orchestration and the wire contract
// while faking only the Olm math.

import { api } from "@/lib/api";
import type { EncryptedMessage } from "@/lib/api";

import { type CryptoAccount, type CryptoProvider, getCryptoProvider, randomPickleKey } from "./crypto";
import { type ClaimedDevice, fanOutEncrypt } from "./envelope";
import { type E2EEStore, IndexedDBStore } from "./store";

/** Keep at least this many unclaimed one-time keys on the backend per device. */
export const MIN_ONE_TIME_KEYS = 20;
/** Refill target when replenishing (sits comfortably above the floor). */
export const OTK_UPLOAD_BATCH = 30;

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
}

export class E2EEEngine {
  private loaded: Loaded | null = null;
  // sender_device_id -> Curve25519 identity_key, for inbound decryption.
  private deviceIdentity = new Map<string, string>();

  constructor(
    private readonly provider: CryptoProvider,
    private readonly store: E2EEStore,
  ) {}

  /** The current device if this browser has one set up, else null. */
  async currentDevice(): Promise<LocalDevice | null> {
    const loaded = await this.ensureLoaded();
    if (!loaded) return null;
    return {
      device_id: loaded.deviceId,
      device_name: loaded.deviceName,
      fingerprint: loaded.account.fingerprint(),
    };
  }

  private async ensureLoaded(): Promise<Loaded | null> {
    if (this.loaded) return this.loaded;
    const record = await this.store.load();
    if (!record) return null;
    const account = await this.provider.restore(record.pickle, record.pickleKey);
    this.loaded = {
      account,
      deviceId: record.deviceId,
      deviceName: record.deviceName,
      pickleKey: record.pickleKey,
    };
    return this.loaded;
  }

  private async persist(): Promise<void> {
    if (!this.loaded) return;
    await this.store.save({
      deviceId: this.loaded.deviceId,
      deviceName: this.loaded.deviceName,
      pickle: this.loaded.account.serialize(this.loaded.pickleKey),
      pickleKey: this.loaded.pickleKey,
    });
  }

  /**
   * setupDevice registers a fresh device on first encrypted use: create the Olm
   * account, publish its public identity/signing keys, upload a batch of one-time
   * prekeys, and persist the pickled account under a random pickle key.
   */
  async setupDevice(name: string): Promise<LocalDevice> {
    const account = await this.provider.create();
    const device = await api.registerE2EEDevice({
      device_name: name,
      identity_key: account.identityKey,
      signing_key: account.signingKey,
    });
    const keys = account.generateOneTimeKeys(OTK_UPLOAD_BATCH);
    await api.uploadE2EEOneTimeKeys(device.id, keys);
    const pickleKey = randomPickleKey();
    this.loaded = { account, deviceId: device.id, deviceName: name, pickleKey };
    await this.persist();
    return { device_id: device.id, device_name: name, fingerprint: account.fingerprint() };
  }

  /**
   * replenishOneTimeKeys tops the device's unclaimed prekeys back up to the
   * batch size whenever they dip below MIN_ONE_TIME_KEYS (each conversation a
   * peer starts consumes one). A no-op when the floor is already met.
   */
  async replenishOneTimeKeys(): Promise<void> {
    const loaded = await this.ensureLoaded();
    if (!loaded) return;
    const { count } = await api.countE2EEOneTimeKeys(loaded.deviceId);
    if (count >= MIN_ONE_TIME_KEYS) return;
    const keys = loaded.account.generateOneTimeKeys(OTK_UPLOAD_BATCH - count);
    await api.uploadE2EEOneTimeKeys(loaded.deviceId, keys);
    await this.persist();
  }

  /**
   * encryptMessage claims one prekey per recipient device AND per the caller's
   * OWN OTHER devices, fans out the ciphertext to all of them, and returns the
   * send body. The caller's current device is excluded (it wrote the plaintext).
   */
  async encryptMessage(
    recipientUserId: string,
    myUserId: string,
    plaintext: string,
  ): Promise<EncryptResult> {
    const loaded = await this.ensureLoaded();
    if (!loaded) throw new Error("no E2EE device is set up");

    const [peer, mine] = await Promise.all([
      api.claimE2EEOneTimeKeys(recipientUserId),
      api.claimE2EEOneTimeKeys(myUserId),
    ]);
    const targets: ClaimedDevice[] = [
      ...peer.claims,
      ...mine.claims.filter((c) => c.device_id !== loaded.deviceId),
    ];
    // Remember each target's identity key so we can decrypt their replies.
    for (const t of targets) this.deviceIdentity.set(t.device_id, t.identity_key);

    const { envelopes, skipped } = fanOutEncrypt({
      encryptor: loaded.account,
      targets,
      plaintext,
    });
    await this.persist();
    return { sender_device_id: loaded.deviceId, envelopes, skipped };
  }

  /**
   * decryptEnvelope decrypts one stored envelope addressed to this device.
   * Throws on an undecryptable message (a missing session, a device that can't
   * read history) — the caller renders a per-message "undecryptable" state.
   */
  async decryptEnvelope(env: EncryptedMessage): Promise<string> {
    const loaded = await this.ensureLoaded();
    if (!loaded) throw new Error("no E2EE device is set up");
    const identityKey = await this.identityKeyFor(env.sender_user_id, env.sender_device_id);
    const plaintext = loaded.account.decryptFrom(identityKey, env.message_type, env.ciphertext);
    await this.persist();
    return plaintext;
  }

  private async identityKeyFor(userId: string, deviceId: string): Promise<string> {
    const cached = this.deviceIdentity.get(deviceId);
    if (cached) return cached;
    const { devices } = await api.listUserE2EEDevices(userId);
    for (const d of devices) this.deviceIdentity.set(d.id, d.identity_key);
    const found = this.deviceIdentity.get(deviceId);
    if (!found) throw new Error("unknown sender device");
    return found;
  }

  /** The caller's own device fingerprint (safety number source), if set up. */
  async localFingerprint(): Promise<DeviceFingerprint | null> {
    const device = await this.currentDevice();
    if (!device) return null;
    return {
      device_id: device.device_id,
      device_name: device.device_name,
      fingerprint: device.fingerprint,
    };
  }

  /** A peer's device fingerprints (from their published signing keys). */
  async peerFingerprints(userId: string): Promise<DeviceFingerprint[]> {
    const { devices } = await api.listUserE2EEDevices(userId);
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
    await this.store.clear();
  }
}

let engineSingleton: E2EEEngine | null = null;

/** getEngine returns the process-wide engine (real crypto provider + store). */
export async function getEngine(): Promise<E2EEEngine> {
  if (!engineSingleton) {
    const provider = await getCryptoProvider();
    engineSingleton = new E2EEEngine(provider, new IndexedDBStore());
  }
  return engineSingleton;
}

/** Test seam: drop the cached singleton so a new provider/store can be wired. */
export function __resetEngineSingletonForTest(): void {
  engineSingleton = null;
}
