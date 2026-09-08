// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  SAFETY_SCAN_REJECTED_CODE,
  SAFETY_SCAN_REJECTED_MESSAGE,
  SCANNER_NOT_CONFIGURED_CODE,
  importOrUploadError,
} from "@/components/studio/shared";
import { ApiError } from "@/lib/api";

// A28's first ruling-shaped finding was that a malware rejection reached the
// creator as a bare FAILED badge with an empty reason — beside a `quarantined`
// video that got a whole explanatory sentence. These pin the copy that closes
// it, and the two properties it has to keep: it must be reachable from the
// CODE, and it must not name the engine or the verdict.

describe("safety-scan rejection copy", () => {
  it("renders the neutral sentence from the typed code", () => {
    const err = new ApiError({
      status: 422,
      code: SAFETY_SCAN_REJECTED_CODE,
      message: SAFETY_SCAN_REJECTED_MESSAGE,
    });
    expect(importOrUploadError(err, "file")).toBe(SAFETY_SCAN_REJECTED_MESSAGE);
    expect(importOrUploadError(err, "url")).toBe(SAFETY_SCAN_REJECTED_MESSAGE);
  });

  it("names neither the scanner nor what it found", () => {
    for (const banned of ["malware", "virus", "clam", "signature", "infected"]) {
      expect(SAFETY_SCAN_REJECTED_MESSAGE.toLowerCase()).not.toContain(banned);
    }
  });

  it("matches the backend sentence byte for byte", () => {
    // vidra-core internal/video/scanpolicy.go SafetyScanRejectedMessage. The
    // async paths write that string onto the upload session and the import job,
    // so a drift here shows the creator two different sentences for one outcome.
    expect(SAFETY_SCAN_REJECTED_MESSAGE).toBe(
      "This file was rejected by the instance's safety scan and was not stored.",
    );
  });

  it("recognises the sentence arriving out of band on a session or job", () => {
    // The upload layer re-throws a failed session as a generic upload_failed
    // carrying failure_reason as its message; without this the URL path would
    // fall through to "Couldn't fetch that URL", sending a creator to debug a
    // link that was fetched perfectly well.
    const err = new ApiError({
      status: 422,
      code: "upload_failed",
      message: SAFETY_SCAN_REJECTED_MESSAGE,
    });
    expect(importOrUploadError(err, "url")).toBe(SAFETY_SCAN_REJECTED_MESSAGE);
    expect(importOrUploadError(err, "file")).toBe(SAFETY_SCAN_REJECTED_MESSAGE);
  });

  it("tells an unconfigured-scanner refusal apart from a rejected file", () => {
    const err = new ApiError({
      status: 503,
      code: SCANNER_NOT_CONFIGURED_CODE,
      message: "this instance has no malware scanner…",
    });
    const copy = importOrUploadError(err, "file");
    expect(copy).not.toBe(SAFETY_SCAN_REJECTED_MESSAGE);
    expect(copy).toContain("safety scanner is not available");
    // The operator sentence names CLAMAV_ADDR; a creator must never see it.
    expect(copy).not.toContain("CLAMAV_ADDR");
  });
});
