// The REAL Olm-backed crypto provider. It is only reached when no stub is
// injected (see getCryptoProvider) — i.e. never in `npm run ci` (mocked tests +
// build) and only in the write-only real-crypto backed spec. It is intentionally
// isolated here so the WASM runtime loads lazily and stays out of every other
// code path.
//
// Olm 1:1 sessions only (DMs are 1:1; no Megolm) per .ralph/specs/e2ee.md §2.

import type * as OlmNS from "@matrix-org/olm";

import type { CryptoAccount, CryptoProvider } from "./crypto";
import type { ClaimedDevice, OlmCiphertext, OneTimeKey } from "./envelope";
import { loadOlm } from "./olm-loader";

interface Pickled {
  account: string;
  outbound: [string, string][]; // identity_key -> session pickle
  inbound: [string, string][]; // identity_key -> session pickle
}

class OlmAccount implements CryptoAccount {
  // One outbound session per peer device identity key; inbound sessions kept per
  // identity key (a device may have more than one over time).
  private outbound = new Map<string, OlmNS.Session>();
  private inbound = new Map<string, OlmNS.Session[]>();

  constructor(
    private readonly Olm: typeof OlmNS,
    private readonly account: OlmNS.Account,
  ) {}

  private keys(): { curve25519: string; ed25519: string } {
    return JSON.parse(this.account.identity_keys()) as { curve25519: string; ed25519: string };
  }

  get identityKey(): string {
    return this.keys().curve25519;
  }

  get signingKey(): string {
    return this.keys().ed25519;
  }

  fingerprint(): string {
    return this.signingKey;
  }

  generateOneTimeKeys(count: number): OneTimeKey[] {
    this.account.generate_one_time_keys(count);
    const parsed = JSON.parse(this.account.one_time_keys()) as {
      curve25519: Record<string, string>;
    };
    this.account.mark_keys_as_published();
    return Object.entries(parsed.curve25519).map(([key_id, key]) => ({ key_id, key }));
  }

  hasOutboundSession(identityKey: string): boolean {
    return this.outbound.has(identityKey);
  }

  encryptFor(device: ClaimedDevice, plaintext: string): OlmCiphertext | null {
    let session = this.outbound.get(device.identity_key);
    if (!session) {
      if (!device.one_time_key) return null; // no session, no OTK → unreachable
      session = new this.Olm.Session();
      session.create_outbound(this.account, device.identity_key, device.one_time_key.key);
      this.outbound.set(device.identity_key, session);
    }
    const result = session.encrypt(plaintext);
    return { message_type: result.type, ciphertext: result.body };
  }

  decryptFrom(senderIdentityKey: string, messageType: 0 | 1, ciphertext: string): string {
    const existing = this.inbound.get(senderIdentityKey) ?? [];
    for (const session of existing) {
      try {
        if (messageType === 0 && !session.matches_inbound_from(senderIdentityKey, ciphertext)) {
          continue;
        }
        return session.decrypt(messageType, ciphertext);
      } catch {
        // Not this session — try the next one.
      }
    }
    if (messageType === 0) {
      const session = new this.Olm.Session();
      session.create_inbound_from(this.account, senderIdentityKey, ciphertext);
      this.account.remove_one_time_keys(session);
      const plaintext = session.decrypt(0, ciphertext);
      existing.push(session);
      this.inbound.set(senderIdentityKey, existing);
      return plaintext;
    }
    throw new Error("no Olm session can decrypt this message");
  }

  serialize(pickleKey: string): string {
    const pickled: Pickled = {
      account: this.account.pickle(pickleKey),
      outbound: [...this.outbound].map(([id, s]) => [id, s.pickle(pickleKey)]),
      inbound: [...this.inbound].flatMap(([id, arr]) =>
        arr.map((s) => [id, s.pickle(pickleKey)] as [string, string]),
      ),
    };
    return JSON.stringify(pickled);
  }

  dispose(): void {
    this.account.free();
    for (const s of this.outbound.values()) s.free();
    for (const arr of this.inbound.values()) for (const s of arr) s.free();
    this.outbound.clear();
    this.inbound.clear();
  }

  hydrate(pickle: string, pickleKey: string): void {
    const parsed = JSON.parse(pickle) as Pickled;
    for (const [id, p] of parsed.outbound ?? []) {
      const s = new this.Olm.Session();
      s.unpickle(pickleKey, p);
      this.outbound.set(id, s);
    }
    for (const [id, p] of parsed.inbound ?? []) {
      const s = new this.Olm.Session();
      s.unpickle(pickleKey, p);
      const list = this.inbound.get(id) ?? [];
      list.push(s);
      this.inbound.set(id, list);
    }
  }
}

export class OlmCryptoProvider implements CryptoProvider {
  async create(): Promise<CryptoAccount> {
    const Olm = await loadOlm();
    const account = new Olm.Account();
    account.create();
    return new OlmAccount(Olm, account);
  }

  async restore(pickle: string, pickleKey: string): Promise<CryptoAccount> {
    const Olm = await loadOlm();
    const parsed = JSON.parse(pickle) as Pickled;
    const account = new Olm.Account();
    account.unpickle(pickleKey, parsed.account);
    const wrapped = new OlmAccount(Olm, account);
    wrapped.hydrate(pickle, pickleKey);
    return wrapped;
  }
}
