import { describe, expect, it } from "vitest";

import type { Video } from "@/lib/api";
import {
  END_CARD_COUNTDOWN_SECONDS,
  countdownAnnouncement,
  nextVideoHref,
  pickNextVideo,
} from "./end-card";

function vid(id: string, extra: Partial<Video> = {}): Video {
  return { id, title: `Video ${id}`, ...extra } as unknown as Video;
}

describe("end-card helpers", () => {
  it("defaults the countdown to 8 seconds", () => {
    expect(END_CARD_COUNTDOWN_SECONDS).toBe(8);
  });

  describe("pickNextVideo", () => {
    it("returns the first related entry (playlist context is out of scope)", () => {
      expect(pickNextVideo([vid("a"), vid("b")])?.id).toBe("a");
    });
    it("returns null when there is nothing related", () => {
      expect(pickNextVideo([])).toBeNull();
      expect(pickNextVideo(null)).toBeNull();
      expect(pickNextVideo(undefined)).toBeNull();
    });
  });

  describe("nextVideoHref", () => {
    it("routes a local video to /videos/{id}", () => {
      expect(nextVideoHref(vid("v9"))).toBe("/videos/v9");
    });
    it("routes a remote card to /remote/{id}", () => {
      expect(nextVideoHref(vid("r3", { remote: true }))).toBe("/remote/r3");
    });
  });

  describe("countdownAnnouncement", () => {
    it("pluralises correctly and clamps/rounds the count", () => {
      expect(countdownAnnouncement(8)).toBe("Playing next in 8 seconds");
      expect(countdownAnnouncement(1)).toBe("Playing next in 1 second");
      expect(countdownAnnouncement(0)).toBe("Playing next in 0 seconds");
      expect(countdownAnnouncement(-2)).toBe("Playing next in 0 seconds");
      expect(countdownAnnouncement(2.4)).toBe("Playing next in 2 seconds");
    });
  });
});
