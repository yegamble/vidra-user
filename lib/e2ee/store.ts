// Device-bound persistence for the E2EE Olm account. The pickled account (with
// a random pickle key) lives in IndexedDB — a device is not portable by design
// (see .ralph/specs/e2ee.md §5: "device-bound; tokens are NOT reused for this").
// The pickle key is stored alongside the pickle: the threat model already assumes
// plaintext exists on the endpoint, so an on-device key adds no exposure while
// keeping the account uninterpretable to code that only reads the pickle string.

export interface StoredDevice {
  deviceId: string;
  deviceName: string;
  pickle: string;
  pickleKey: string;
}

/** The persistence boundary the engine depends on (fakeable in unit tests). */
export interface E2EEStore {
  load(): Promise<StoredDevice | null>;
  save(device: StoredDevice): Promise<void>;
  clear(): Promise<void>;
  /**
   * loadPlaintext / savePlaintext cache a decrypted message keyed by its
   * envelope id. Olm messages are ONE-SHOT decryptable (a pre-key/ratchet
   * message consumes its one-time key and ratchets the session past it), so a
   * reload that re-fetches every envelope must NOT re-decrypt — it reads the
   * cached plaintext instead. This matches how real Olm clients persist
   * decrypted messages; the threat model already assumes plaintext lives on the
   * endpoint (see the file header), so an on-device cache adds no exposure.
   */
  loadPlaintext(envelopeId: string): Promise<string | null>;
  savePlaintext(envelopeId: string, plaintext: string): Promise<void>;
}

const DB_NAME = "vidra-e2ee";
const STORE_NAME = "device";
const PLAINTEXT_STORE = "plaintext";
const RECORD_KEY = "self";
// v2 adds the `plaintext` store (decrypted-message cache). Existing v1 databases
// upgrade in place — the device record is preserved, the new store is created.
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(PLAINTEXT_STORE)) {
        db.createObjectStore(PLAINTEXT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("failed to open the E2EE database"));
  });
}

/** The real IndexedDB-backed device store (browser only). */
export class IndexedDBStore implements E2EEStore {
  async load(): Promise<StoredDevice | null> {
    const db = await openDb();
    try {
      return await new Promise<StoredDevice | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
        req.onsuccess = () => resolve((req.result as StoredDevice | undefined) ?? null);
        req.onerror = () => reject(req.error ?? new Error("failed to read the E2EE device"));
      });
    } finally {
      db.close();
    }
  }

  async save(device: StoredDevice): Promise<void> {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(device, RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("failed to save the E2EE device"));
      });
    } finally {
      db.close();
    }
  }

  async clear(): Promise<void> {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        // Forgetting this device also drops the decrypted-message cache: a fresh
        // device can't decrypt old envelopes, so cached plaintext must not leak
        // into it.
        const tx = db.transaction([STORE_NAME, PLAINTEXT_STORE], "readwrite");
        tx.objectStore(STORE_NAME).delete(RECORD_KEY);
        tx.objectStore(PLAINTEXT_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("failed to clear the E2EE device"));
      });
    } finally {
      db.close();
    }
  }

  async loadPlaintext(envelopeId: string): Promise<string | null> {
    const db = await openDb();
    try {
      return await new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(PLAINTEXT_STORE, "readonly");
        const req = tx.objectStore(PLAINTEXT_STORE).get(envelopeId);
        req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
        req.onerror = () => reject(req.error ?? new Error("failed to read cached plaintext"));
      });
    } finally {
      db.close();
    }
  }

  async savePlaintext(envelopeId: string, plaintext: string): Promise<void> {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PLAINTEXT_STORE, "readwrite");
        tx.objectStore(PLAINTEXT_STORE).put(plaintext, envelopeId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("failed to cache plaintext"));
      });
    } finally {
      db.close();
    }
  }
}
