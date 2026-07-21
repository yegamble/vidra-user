import { describe, expect, it } from "vitest";

import { BASE_VIDEO_ACCEPT, isAcceptedVideoFile, videoAcceptAttr } from "./upload-accept";

describe("videoAcceptAttr", () => {
  it("keeps the permissive video/* accept while the extended set is on", () => {
    expect(videoAcceptAttr(true)).toBe("video/*");
  });

  it("fails open when the flag is unknown (older backend / failed fetch)", () => {
    expect(videoAcceptAttr(undefined)).toBe("video/*");
    expect(videoAcceptAttr(null)).toBe("video/*");
  });

  it("narrows to the base containers once the admin turns the extended set off", () => {
    const accept = videoAcceptAttr(false);
    expect(accept).toBe(BASE_VIDEO_ACCEPT);
    for (const ext of [".mp4", ".webm", ".ogv", ".ogg"]) {
      expect(accept).toContain(ext);
    }
    expect(accept).not.toContain(".mkv");
    expect(accept).not.toContain("video/*");
  });
});

describe("isAcceptedVideoFile (drag-and-drop filter)", () => {
  it("accepts any video/* MIME while the extended set is on/unknown", () => {
    expect(isAcceptedVideoFile({ name: "clip.mkv", type: "video/x-matroska" }, true)).toBe(true);
    expect(isAcceptedVideoFile({ name: "clip.mov", type: "video/quicktime" }, undefined)).toBe(true);
  });

  it("rejects a non-video MIME", () => {
    expect(isAcceptedVideoFile({ name: "notes.pdf", type: "application/pdf" }, true)).toBe(false);
    expect(isAcceptedVideoFile({ name: "pic.png", type: "image/png" }, null)).toBe(false);
  });

  it("falls back to a video extension when the OS reports no MIME type", () => {
    expect(isAcceptedVideoFile({ name: "clip.mp4", type: "" }, true)).toBe(true);
    expect(isAcceptedVideoFile({ name: "archive.zip", type: "" }, true)).toBe(false);
  });

  it("narrows to the base containers once the extended set is off", () => {
    expect(isAcceptedVideoFile({ name: "clip.mp4", type: "video/mp4" }, false)).toBe(true);
    // A container the server would 415 is filtered client-side too.
    expect(isAcceptedVideoFile({ name: "clip.mkv", type: "video/x-matroska" }, false)).toBe(false);
  });
});
