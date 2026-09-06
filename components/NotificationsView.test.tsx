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

  // The regression this slice exists for: a reply used to notify only the
  // video's owner, so the person being answered saw nothing. Rendering it as a
  // plain "commented on" would reintroduce the same confusion in the UI — the
  // copy has to say it was a reply to YOUR comment and name who wrote it.
  it("renders comment_reply as an answer to your comment, naming the replier", () => {
    const { lead, rest, href } = describeNotification(
      notif({
        type: "comment_reply",
        actor: { username: "cara", display_name: "Cara" },
        video_id: "v-1",
        video_title: "Clip",
        comment_id: "c-2",
      }),
    );
    expect(lead).toBe("Cara");
    expect(rest).toContain("replied to your comment");
    expect(rest).toContain("Clip");
    expect(rest).not.toContain("commented on your video");
    expect(href).toBe("/videos/v-1");
  });

  it("still renders comment as a comment on YOUR video, distinct from a reply", () => {
    const comment = describeNotification(
      notif({ type: "comment", actor: { username: "bob", display_name: "" }, video_id: "v-1", video_title: "Clip" }),
    );
    const reply = describeNotification(
      notif({ type: "comment_reply", actor: { username: "bob", display_name: "" }, video_id: "v-1", video_title: "Clip" }),
    );
    expect(comment.rest).toContain("commented on");
    expect(reply.rest).not.toBe(comment.rest);
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

  // The reject route has always collected a reason and, until migration 0130,
  // dropped it — so this copy used to say the reason is "never exposed by the
  // contract". It is now the creator's only explanation of why their upload was
  // refused, and a notification that omits it wastes the only thing the
  // moderator was asked to write.
  it("renders video_rejected with the moderator's note when there is one", () => {
    const { lead, rest, href } = describeNotification(
      notif({
        type: "video_rejected",
        video_id: "v-1",
        video_title: "Clip",
        moderation_note: "Music you do not hold the rights to.",
      }),
    );
    expect(lead).toBe("A moderator");
    expect(rest).toContain("Clip");
    expect(rest).toContain("Music you do not hold the rights to.");
    expect(href).toBe("/studio");
  });

  it("renders video_rejected without a note exactly as before", () => {
    const { rest } = describeNotification(
      notif({ type: "video_rejected", video_id: "v-1", video_title: "Clip" }),
    );
    expect(rest).toContain("was not published");
    expect(rest).not.toContain("—  ");
  });

  // A block is NOT a rejection: it takes down content that was live, it is
  // reversible, and the video is hidden from its owner too. Rendering it with
  // the rejection copy would tell a creator their upload never published, which
  // is false, and the type-union switch falling through to "started following"
  // is this repo's most-repeated frontend bug.
  it("renders video_blocked as a take-down of a published video, without a reason", () => {
    const { lead, rest, href } = describeNotification(
      notif({ type: "video_blocked", video_id: "v-1", video_title: "Clip" }),
    );
    expect(lead).toBe("A moderator");
    expect(rest).toContain("Clip");
    expect(rest).toContain("blocked");
    expect(rest).not.toContain("started following");
    expect(rest).not.toContain("rejected");
    expect(href).toBe("/studio/content");
  });
});

describe("notification pref labels", () => {
  it("covers every switchboard type the backend ships, including new_report and new_video", () => {
    for (const type of [
      "caption_ready",
      "comment",
      "comment_reply",
      "follow",
      "message",
      "new_report",
      "new_video",
      "report_resolved",
      "video_rejected",
      "video_blocked",
    ]) {
      expect(TYPE_LABELS[type], `missing TYPE_LABELS entry for ${type}`).toBeDefined();
    }
  });
});
