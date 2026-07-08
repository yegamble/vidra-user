import { describe, expect, it } from "vitest";

import { computeFileFingerprint, findUploadByFingerprint, FINGERPRINT_SAMPLE_BYTES } from "./fingerprint";

// A File whose bytes are deterministic (a repeating counter) so head/tail windows
// differ from each other — the fingerprint must depend on both.
function fileOf(size: number, seed = 1, name = "clip.mp4"): File {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * seed) & 0xff;
  return new File([bytes], name, { type: "video/mp4" });
}

describe("computeFileFingerprint", () => {
  it("is a 64-char (SHA-256) lowercase hex string", async () => {
    const fp = await computeFileFingerprint(fileOf(4096));
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same bytes + size", async () => {
    const a = await computeFileFingerprint(fileOf(4096, 3));
    const b = await computeFileFingerprint(fileOf(4096, 3));
    expect(a).toBe(b);
  });

  it("differs when the size differs (size is part of the digest)", async () => {
    const a = await computeFileFingerprint(fileOf(4096, 3));
    const b = await computeFileFingerprint(fileOf(4097, 3));
    expect(a).not.toBe(b);
  });

  it("differs when the head bytes differ (content is part of the digest)", async () => {
    const a = await computeFileFingerprint(fileOf(4096, 3));
    const b = await computeFileFingerprint(fileOf(4096, 5));
    expect(a).not.toBe(b);
  });

  it("differs when only the tail bytes differ (both windows are hashed)", async () => {
    // Two files with identical first 1 MiB but a different final byte: the tail
    // window must pull them apart (a head-only hash would collide).
    const size = FINGERPRINT_SAMPLE_BYTES + 512;
    const a = new Uint8Array(size);
    for (let i = 0; i < size; i++) a[i] = i & 0xff;
    const b = a.slice();
    b[size - 1] = a[size - 1] ^ 0xff;
    const fpA = await computeFileFingerprint(new File([a], "a.mp4"));
    const fpB = await computeFileFingerprint(new File([b], "b.mp4"));
    expect(fpA).not.toBe(fpB);
  });

  it("does not throw on an empty file (head and tail windows are empty)", async () => {
    const fp = await computeFileFingerprint(new File([], "empty.mp4"));
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("findUploadByFingerprint", () => {
  const uploads = [
    { upload_id: "a", file_fingerprint: "aaa" },
    { upload_id: "b", file_fingerprint: "bbb" },
    { upload_id: "c", file_fingerprint: "" },
  ];

  it("returns the upload whose fingerprint matches", () => {
    expect(findUploadByFingerprint(uploads, "bbb")?.upload_id).toBe("b");
  });

  it("returns null when nothing matches", () => {
    expect(findUploadByFingerprint(uploads, "zzz")).toBeNull();
  });

  it("never matches an empty stored fingerprint, even for an empty query", () => {
    expect(findUploadByFingerprint(uploads, "")).toBeNull();
  });
});
