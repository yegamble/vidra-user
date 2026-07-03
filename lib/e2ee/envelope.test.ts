import { describe, expect, it, vi } from "vitest";

import {
  type ClaimedDevice,
  type OlmCiphertext,
  type SessionEncryptor,
  DISAPPEARING_OPTIONS,
  expiresInSeconds,
  fanOutEncrypt,
  formatSafetyNumber,
} from "./envelope";

function device(id: string, withKey = true): ClaimedDevice {
  return {
    device_id: id,
    identity_key: `idk-${id}`,
    signing_key: `sgk-${id}`,
    one_time_key: withKey ? { key_id: `k-${id}`, key: `otk-${id}` } : null,
  };
}

// A trivial encryptor: it reaches any device that carries a claimed OTK and
// echoes back a deterministic ciphertext; a device with no OTK is unreachable
// (returns null). This is exactly the seam fanOutEncrypt depends on.
const echoEncryptor: SessionEncryptor = {
  encryptFor(d, plaintext): OlmCiphertext | null {
    if (!d.one_time_key) return null;
    return { message_type: 0, ciphertext: `${d.device_id}:${plaintext}` };
  },
};

describe("fanOutEncrypt", () => {
  it("produces one envelope per reachable target device", () => {
    const { envelopes, skipped } = fanOutEncrypt({
      encryptor: echoEncryptor,
      targets: [device("a"), device("b")],
      plaintext: "hello",
    });
    expect(skipped).toEqual([]);
    expect(envelopes).toEqual([
      { recipient_device_id: "a", message_type: 0, ciphertext: "a:hello" },
      { recipient_device_id: "b", message_type: 0, ciphertext: "b:hello" },
    ]);
  });

  it("skips (never drops) a device with no session and no claimed OTK", () => {
    const { envelopes, skipped } = fanOutEncrypt({
      encryptor: echoEncryptor,
      targets: [device("a"), device("dead", false)],
      plaintext: "hi",
    });
    expect(envelopes.map((e) => e.recipient_device_id)).toEqual(["a"]);
    expect(skipped).toEqual(["dead"]);
  });

  it("de-dupes a device that appears twice (peer + own claim overlap)", () => {
    const spy = vi.fn(echoEncryptor.encryptFor);
    const { envelopes } = fanOutEncrypt({
      encryptor: { encryptFor: spy },
      targets: [device("a"), device("a")],
      plaintext: "x",
    });
    expect(envelopes).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("encrypts the same plaintext independently per device", () => {
    const seen: string[] = [];
    fanOutEncrypt({
      encryptor: {
        encryptFor(d, pt) {
          seen.push(d.device_id);
          return { message_type: 1, ciphertext: pt };
        },
      },
      targets: [device("a"), device("b"), device("c")],
      plaintext: "secret",
    });
    expect(seen).toEqual(["a", "b", "c"]);
  });
});

describe("expiresInSeconds", () => {
  it("returns undefined for off (no disappearing timer)", () => {
    expect(expiresInSeconds("off")).toBeUndefined();
  });

  it("maps each timer option to its bounded second count", () => {
    expect(expiresInSeconds("1h")).toBe(3600);
    expect(expiresInSeconds("1d")).toBe(86400);
    expect(expiresInSeconds("1w")).toBe(604800);
  });

  it("every non-off option lies within the backend 30s–90d bound", () => {
    for (const opt of DISAPPEARING_OPTIONS) {
      const secs = expiresInSeconds(opt.value);
      if (secs === undefined) continue;
      expect(secs).toBeGreaterThanOrEqual(30);
      expect(secs).toBeLessThanOrEqual(7776000);
    }
  });
});

describe("formatSafetyNumber", () => {
  it("groups the signing key into blocks of four", () => {
    expect(formatSafetyNumber("ABCDEFGH")).toBe("ABCD EFGH");
    expect(formatSafetyNumber("ABCDEFG")).toBe("ABCD EFG");
  });

  it("collapses existing whitespace before grouping", () => {
    expect(formatSafetyNumber("AB CD EF")).toBe("ABCD EF");
  });
});
