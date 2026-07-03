// PURE E2EE helpers — no browser, WASM, or network dependencies. The fan-out
// logic and the disappearing-timer / safety-number formatting live here so they
// can be unit-tested without fighting the Olm WASM runtime (which is the reason
// the slice mandates "unit-test the pure envelope/fan-out helpers").

/** A public one-time prekey (client-assigned key_id). Mirrors E2EEOneTimeKey. */
export interface OneTimeKey {
  key_id: string;
  key: string;
}

/**
 * A recipient device to encrypt to: its public identity plus (optionally) one
 * freshly claimed one-time key. `one_time_key` is null when the device's
 * prekeys are exhausted — with no existing Olm session we cannot reach it, so it
 * is skipped rather than silently dropped. Mirrors the backend E2EEClaim.
 */
export interface ClaimedDevice {
  device_id: string;
  identity_key: string;
  signing_key: string;
  one_time_key: OneTimeKey | null;
}

/** One Olm ciphertext (message_type 0 = prekey, 1 = normal). */
export interface OlmCiphertext {
  message_type: 0 | 1;
  ciphertext: string;
}

/** One per-recipient-device ciphertext blob for the encrypted send request. */
export interface OutgoingEnvelope {
  recipient_device_id: string;
  message_type: 0 | 1;
  ciphertext: string;
}

/**
 * The crypto seam the fan-out depends on: encrypt one plaintext for one device,
 * establishing an Olm session from the device's claimed OTK on first contact.
 * Returns null when the device cannot be reached (no session and no OTK left).
 */
export interface SessionEncryptor {
  encryptFor(device: ClaimedDevice, plaintext: string): OlmCiphertext | null;
}

/**
 * fanOutEncrypt encrypts one plaintext once per target device and collects the
 * envelopes. Targets are the peer's devices PLUS the sender's own OTHER devices
 * (so the sender can read the message on their other devices); the caller must
 * exclude the sending device itself. A device with no reachable session
 * (encryptFor → null) is reported in `skipped`, never silently dropped, so the
 * UI can be honest about a device it could not deliver to.
 */
export function fanOutEncrypt(input: {
  encryptor: SessionEncryptor;
  targets: ClaimedDevice[];
  plaintext: string;
}): { envelopes: OutgoingEnvelope[]; skipped: string[] } {
  const envelopes: OutgoingEnvelope[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const device of input.targets) {
    if (seen.has(device.device_id)) continue; // de-dupe a device claimed twice
    seen.add(device.device_id);
    const ct = input.encryptor.encryptFor(device, input.plaintext);
    if (!ct) {
      skipped.push(device.device_id);
      continue;
    }
    envelopes.push({
      recipient_device_id: device.device_id,
      message_type: ct.message_type,
      ciphertext: ct.ciphertext,
    });
  }
  return { envelopes, skipped };
}

/** Disappearing-message timer options offered in the encrypted composer. */
export type DisappearingOption = "off" | "1h" | "1d" | "1w";

export const DISAPPEARING_OPTIONS: { value: DisappearingOption; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
];

const DISAPPEARING_SECONDS: Record<Exclude<DisappearingOption, "off">, number> = {
  "1h": 3600,
  "1d": 86400,
  "1w": 604800,
};

/**
 * expiresInSeconds maps a timer option to the send request's
 * expires_in_seconds, or undefined for "off" (no disappearing timer). Every
 * non-off value sits inside the backend's 30s–90d bound.
 */
export function expiresInSeconds(option: DisappearingOption): number | undefined {
  return option === "off" ? undefined : DISAPPEARING_SECONDS[option];
}

/**
 * formatSafetyNumber renders a device's public Ed25519 signing key as a grouped
 * "safety number" for out-of-band fingerprint comparison. It does not change the
 * key's trust in any way — it only makes the existing public key readable in
 * blocks of four, per §1's honest-verification guidance (compare it out of band;
 * the server could still substitute keys for a user who never compares).
 */
export function formatSafetyNumber(signingKey: string): string {
  const compact = signingKey.replace(/\s+/g, "");
  const groups: string[] = [];
  for (let i = 0; i < compact.length; i += 4) {
    groups.push(compact.slice(i, i + 4));
  }
  return groups.join(" ");
}
