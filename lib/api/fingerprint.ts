// Client-side file fingerprinting for cross-refresh / cross-device upload resume
// (UPLOAD-02/03). The server (GET /api/v1/me/uploads, POST .../upload-session)
// stores an OPAQUE identity string per session and only ever COMPARES it — it
// never parses it. The documented recipe (openapi.yaml CreateUploadSessionRequest)
// is a SHA-256 over the file size concatenated with its first and last 1 MiB:
// cheap (it never reads the whole file) yet specific enough that two different
// files effectively never collide. Both the create-time fingerprint and the
// re-pick match are computed by THIS code, so the exact byte layout only has to
// be self-consistent — never round-tripped through the server as structure.

/** The head/tail sample window, in bytes (1 MiB), hashed alongside the size. */
export const FINGERPRINT_SAMPLE_BYTES = 1024 * 1024;

function toHex(buf: ArrayBuffer): string {
  let out = "";
  for (const b of new Uint8Array(buf)) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * computeFileFingerprint returns the SHA-256 hex digest identifying `file` for
 * resume matching. Deterministic for a given (size, head 1 MiB, tail 1 MiB); a
 * change to any of those three changes the digest, and two files that differ only
 * in the middle of a >2 MiB body would still (rarely) collide — acceptable for a
 * resume hint that is always re-verified against the concrete re-picked file.
 * Requires WebCrypto (`crypto.subtle`), present in every supported browser and in
 * the Node (>=20) test runtime.
 */
export async function computeFileFingerprint(file: Blob): Promise<string> {
  const size = file.size;
  const window = Math.min(FINGERPRINT_SAMPLE_BYTES, size);
  const head = new Uint8Array(await file.slice(0, window).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, size - window), size).arrayBuffer());
  // An 8-byte little-endian size header, then the head + tail sample windows.
  const payload = new Uint8Array(8 + head.byteLength + tail.byteLength);
  new DataView(payload.buffer).setBigUint64(0, BigInt(size), true);
  payload.set(head, 8);
  payload.set(tail, 8 + head.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return toHex(digest);
}

/**
 * findUploadByFingerprint returns the first upload whose (non-empty)
 * file_fingerprint equals `fingerprint`, or null. An empty stored fingerprint (a
 * session opened before the client supplied one) never matches — this is the
 * server-truth answer to "am I already uploading this exact file?".
 */
export function findUploadByFingerprint<T extends { file_fingerprint: string }>(
  uploads: readonly T[],
  fingerprint: string,
): T | null {
  if (!fingerprint) return null;
  return uploads.find((u) => u.file_fingerprint !== "" && u.file_fingerprint === fingerprint) ?? null;
}
