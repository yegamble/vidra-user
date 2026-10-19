import { api } from "@/lib/api";
import type { CryptoProvider } from "./crypto";
import { IndexedDBStore } from "./store";

export async function accountStore(userId: string, provider: CryptoProvider, assertCurrent: () => void) {
  const scoped = new IndexedDBStore(`vidra-e2ee:${encodeURIComponent(userId)}`);
  const existing = await scoped.load();
  assertCurrent();
  if (existing) return scoped;

  // Keep existing history in place. The old origin-wide database is usable only
  // when the authenticated directory proves ownership of BOTH public keys.
  const legacy = new IndexedDBStore();
  const record = await legacy.load();
  assertCurrent();
  if (!record?.deviceId) return scoped;
  const { devices } = await api.listMyE2EEDevices();
  assertCurrent();
  const device = devices.find((d) => d.id === record.deviceId);
  if (!device) return scoped;
  const account = await provider.restore(record.pickle, record.pickleKey);
  try {
    assertCurrent();
    return device.identity_key === account.identityKey && device.signing_key === account.signingKey
      ? legacy : scoped;
  } finally {
    account.dispose();
  }
}
