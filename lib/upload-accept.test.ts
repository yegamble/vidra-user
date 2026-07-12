import { describe, expect, it } from "vitest";

import { BASE_VIDEO_ACCEPT, videoAcceptAttr } from "./upload-accept";

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
