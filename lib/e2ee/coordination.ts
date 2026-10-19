import type { E2EEEngine } from "./engine";

const OPERATIONS = new Set<PropertyKey>([
  "currentDevice", "setupDevice", "ensureDevice", "replenishOneTimeKeys",
  "encryptMessage", "decryptEnvelope", "recordOwnMessage", "ownMessages",
  "localFingerprint", "forgetDevice",
]);
const localQueues = new Map<string, Promise<unknown>>();

export function supportsCrossTabCoordination(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.locks?.request === "function";
}

// Older browsers retain same-realm serialization. This fallback cannot protect
// a shared Olm account from another tab; it is not equivalent to Web Locks.
function locally(name: string, run: () => Promise<unknown>): Promise<unknown> {
  const previous = localQueues.get(name) ?? Promise.resolve();
  const pending = previous.then(run, run);
  localQueues.set(name, pending);
  const cleanup = () => { if (localQueues.get(name) === pending) localQueues.delete(name); };
  void pending.then(cleanup, cleanup);
  return pending;
}

/** Serialize account operations and reload durable ratchets while holding the lock. */
export function coordinateEngine(engine: E2EEEngine, userId: string, assertSession: () => void): E2EEEngine {
  const name = `vidra-e2ee:${userId}`;
  return new Proxy(engine, {
    get(target, property) {
      const method = Reflect.get(target, property, target);
      if (typeof method !== "function") return method;
      // Keep internal calls on the original target: setupDevice calls
      // ensureDevice, and localFingerprint calls currentDevice. Re-locking
      // either through the facade would deadlock on the account's own lock.
      if (!OPERATIONS.has(property)) return method.bind(target);
      return async (...args: unknown[]) => {
        assertSession();
        const run = async () => {
          assertSession(); // The account can change while waiting for a tab.
          target.reset(); // A cached account could overwrite another tab's work.
          const result: unknown = await Reflect.apply(method, target, args);
          assertSession();
          return result;
        };
        return supportsCrossTabCoordination()
          ? navigator.locks.request(name, run)
          : locally(name, run);
      };
    },
  });
}
