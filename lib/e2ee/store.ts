// Device-bound persistence for the E2EE Olm account. The pickled account (with
// a random pickle key) lives in IndexedDB — a device is not portable by design
// (see .ralph/specs/e2ee.md §5: "device-bound; tokens are NOT reused for this").
// The pickle key is stored alongside the pickle: the threat model already assumes
// plaintext exists on the endpoint, so an on-device key adds no exposure while
// keeping the account uninterpretable to code that only reads the pickle string.
//
// The same database also holds two plaintext caches under that accepted model:
// `plaintext` (decrypted inbound messages, keyed by envelope id) and `outbox`
// (messages THIS device sent, which the server can never hand back). Both are
// wiped when the device is forgotten.

export interface StoredDevice {
  deviceId: string;
  deviceName: string;
  pickle: string;
  pickleKey: string;
}

/**
 * A message THIS device sent, kept locally because the wire cannot give it back.
 * The fan-out never addresses an envelope to the sending device (it wrote the
 * plaintext) and the backend returns only envelopes addressed to the caller's own
 * devices — so a sender's list-messages is empty for everything it sent. Without
 * this record, every remount of an encrypted thread loses our side of it.
 */
export interface OwnMessageRecord {
  /** Client-generated id (a uuid); also the React key of the rendered bubble. */
  id: string;
  conversationId: string;
  text: string;
  created_at: string;
  /** Set when a disappearing-message timer was applied (mirrors the envelope). */
  expires_at?: string;
  /** Who this was fanned out to — the composer's recipient fallback after a reload. */
  recipient_user_id?: string;
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
  /**
   * saveOwnMessage / listOwnMessages persist what this device SENT, for the same
   * reason and under the same threat model as the plaintext cache above: the
   * server can never hand a sender its own messages back (see OwnMessageRecord).
   */
  saveOwnMessage(rec: OwnMessageRecord): Promise<void>;
  listOwnMessages(conversationId: string): Promise<OwnMessageRecord[]>;
}

const DB_NAME = "vidra-e2ee";
const STORE_NAME = "device";
const PLAINTEXT_STORE = "plaintext";
const OUTBOX_STORE = "outbox";
const RECORD_KEY = "self";
// v2 adds the `plaintext` store (decrypted-message cache); v3 adds `outbox` (the
// sent-message record). Existing v1/v2 databases upgrade in place — the device
// record and any cached plaintext are preserved, only missing stores are created.
const DB_VERSION = 3;

// Outbox records are keyed "<conversationId> <id>" so one conversation's sends are
// a contiguous key range. The space separator sorts below every character a uuid
// can contain, so the prefix range can never bleed into a neighbouring id.
function outboxKey(conversationId: string, id: string): string {
  return `${conversationId} ${id}`;
}

function outboxRange(conversationId: string): IDBKeyRange {
  const prefix = `${conversationId} `;
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`);
}

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
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE);
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
        // Forgetting this device also drops the decrypted-message cache AND the
        // sent-message outbox: a fresh device can't decrypt old envelopes, so no
        // readable history — inbound or our own — may leak into it.
        const tx = db.transaction([STORE_NAME, PLAINTEXT_STORE, OUTBOX_STORE], "readwrite");
        tx.objectStore(STORE_NAME).delete(RECORD_KEY);
        tx.objectStore(PLAINTEXT_STORE).clear();
        tx.objectStore(OUTBOX_STORE).clear();
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

  async saveOwnMessage(rec: OwnMessageRecord): Promise<void> {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, "readwrite");
        tx.objectStore(OUTBOX_STORE).put(rec, outboxKey(rec.conversationId, rec.id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("failed to record the sent message"));
      });
    } finally {
      db.close();
    }
  }

  async listOwnMessages(conversationId: string): Promise<OwnMessageRecord[]> {
    const db = await openDb();
    try {
      return await new Promise<OwnMessageRecord[]>((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, "readonly");
        const req = tx.objectStore(OUTBOX_STORE).getAll(outboxRange(conversationId));
        req.onsuccess = () => resolve((req.result as OwnMessageRecord[] | undefined) ?? []);
        req.onerror = () => reject(req.error ?? new Error("failed to read sent messages"));
      });
    } finally {
      db.close();
    }
  }
}
