// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { Notification } from "@/lib/api";

import { TYPE_LABELS } from "./NotificationPrefsView";
import { describeNotification } from "./NotificationsView";

function notif(overrides: Partial<Notification>): Notification {
  return {
    id: "n-1",
    type: "follow",
    read: false,
    created_at: "2026-08-09T12:00:00Z",
    ...overrides,
  } as Notification;
}

describe("describeNotification", () => {
  it("renders new_report as the reporter filing a report, linking to the admin queue", () => {
    const { lead, rest, href } = describeNotification(
      notif({
        type: "new_report",
        actor: { username: "bob", display_name: "" },
        report_id: "r-1",
        report_status: "open",
        report_target_type: "video",
      }),
    );
    expect(lead).toBe("bob");
    expect(rest).toContain("reported a video");
    expect(href).toBe("/admin");
  });

  it("renders new_video as the channel publishing, linking to the video", () => {
    const { lead, rest, href } = describeNotification(
      notif({
        type: "new_video",
        actor: { username: "ada", display_name: "Ada" },
        channel_handle: "ada",
        channel_display_name: "Ada's Channel",
        video_id: "v-1",
        video_title: "Clip",
      }),
    );
    expect(lead).toBe("Ada's Channel");
    expect(rest).toContain("Clip");
    expect(rest).not.toContain("started following");
    expect(href).toBe("/videos/v-1");
  });
});

describe("notification pref labels", () => {
  it("covers every switchboard type the backend ships, including new_report and new_video", () => {
    for (const type of [
      "caption_ready",
      "comment",
      "follow",
      "message",
      "new_report",
      "new_video",
      "report_resolved",
      "video_rejected",
    ]) {
      expect(TYPE_LABELS[type], `missing TYPE_LABELS entry for ${type}`).toBeDefined();
    }
  });
});
