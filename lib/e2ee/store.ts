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
}

const DB_NAME = "vidra-e2ee";
const STORE_NAME = "device";
const RECORD_KEY = "self";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
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
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("failed to clear the E2EE device"));
      });
    } finally {
      db.close();
    }
  }
}
