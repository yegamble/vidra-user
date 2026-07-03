// The client-side E2EE crypto boundary. All cryptography is client-side (Olm);
// the backend only stores opaque ciphertext (see .ralph/specs/e2ee.md §2-3).
//
// This module defines the crypto SEAM: the interfaces the engine talks to, and
// getCryptoProvider(), which returns the real Olm-backed provider EXCEPT when a
// stub has been injected (globalThis.__VIDRA_E2EE_CRYPTO__). Mocked Playwright
// runs and unit tests inject a fake so they never load the Olm WASM — exactly
// the "inject a fake encryptor via a test seam" requirement.

import type { OneTimeKey, SessionEncryptor } from "./envelope";

/**
 * A device's Olm account: its public identity keys, one-time-key generation, the
 * encrypt/decrypt operations, and (de)serialization for device-bound storage.
 * Extends SessionEncryptor so it can drive fanOutEncrypt directly.
 */
export interface CryptoAccount extends SessionEncryptor {
  /** Public Curve25519 identity key (base64). Private keys never leave here. */
  readonly identityKey: string;
  /** Public Ed25519 signing key (base64). */
  readonly signingKey: string;
  /** The device fingerprint used for the safety-number display. */
  fingerprint(): string;
  /** Generate `count` one-time prekeys and mark them published. */
  generateOneTimeKeys(count: number): OneTimeKey[];
  /**
   * Decrypt one inbound ciphertext from a sender device (creating an inbound Olm
   * session for a type-0 prekey message). Throws on an undecryptable message —
   * the caller renders a per-message "undecryptable" state, never a crash.
   */
  decryptFrom(senderIdentityKey: string, messageType: 0 | 1, ciphertext: string): string;
  /** Pickle the account + sessions with the random device pickle key. */
  serialize(pickleKey: string): string;
  /** Release native (WASM) resources. */
  dispose(): void;
}

/** Creates fresh accounts or rehydrates them from a stored pickle. */
export interface CryptoProvider {
  create(): Promise<CryptoAccount>;
  restore(pickle: string, pickleKey: string): Promise<CryptoAccount>;
}

interface CryptoGlobal {
  __VIDRA_E2EE_CRYPTO__?: CryptoProvider;
}

/**
 * getCryptoProvider returns the injected stub provider when one is present
 * (tests), otherwise dynamically imports the real Olm provider. The dynamic
 * import keeps the Olm runtime out of the server bundle and out of any code path
 * a stubbed run touches.
 */
export async function getCryptoProvider(): Promise<CryptoProvider> {
  const injected = (globalThis as CryptoGlobal).__VIDRA_E2EE_CRYPTO__;
  if (injected) return injected;
  const { OlmCryptoProvider } = await import("./olm-crypto");
  return new OlmCryptoProvider();
}

/** A cryptographically-random device pickle key (base64, 32 bytes of entropy). */
export function randomPickleKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
