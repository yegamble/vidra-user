// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Notification } from "@/lib/api";

import { TYPE_LABELS } from "./NotificationPrefsView";
import { NotificationTypeIcon, describeNotification } from "./NotificationsView";

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
  it("renders video_blocked as a take-down of a published video, carrying the moderator's reason", () => {
    const { lead, rest, href } = describeNotification(
      notif({
        type: "video_blocked",
        video_id: "v-1",
        video_title: "Clip",
        moderation_note: "Third-party music you do not hold the rights to",
      }),
    );
    expect(lead).toBe("A moderator");
    expect(rest).toContain("Clip");
    expect(rest).toContain("blocked");
    // The A16 ruling: a creator told only that their work was taken down can
    // neither appeal it nor avoid repeating it.
    expect(rest).toContain("Third-party music you do not hold the rights to");
    expect(rest).not.toContain("started following");
    expect(rest).not.toContain("rejected");
    expect(href).toBe("/studio/content");
  });

  // A block lifted before the creator read the notice deletes the reason, and a
  // moderator may have written none. Both land here, and the copy has to still
  // be a whole sentence rather than one ending in a dangling colon.
  it("renders video_blocked without a reason as the neutral notice it always was", () => {
    const { rest } = describeNotification(
      notif({ type: "video_blocked", video_id: "v-1", video_title: "Clip" }),
    );
    expect(rest).toBe(" blocked “Clip” — it is no longer available to viewers");
    expect(rest).not.toContain(":");
  });

  // The loop video_blocked opened: before this type existed the creator was told
  // their video had been taken down and then nothing at all when it came back,
  // so the only way to find out was to keep checking. A missing case here would
  // render it as "started following", this repo's most-repeated frontend bug.
  it("renders video_unblocked as a restoration, linking to the video that works again", () => {
    const { lead, rest, href } = describeNotification(
      notif({ type: "video_unblocked", video_id: "v-1", video_title: "Clip" }),
    );
    expect(lead).toBe("A moderator");
    expect(rest).toContain("restored");
    expect(rest).toContain("Clip");
    expect(rest).not.toContain("started following");
    expect(rest).not.toContain("blocked");
    expect(href).toBe("/videos/v-1");
  });
});

// The chip is decoration, but the WRONG decoration is a claim: the follow glyph
// in a neutral circle is what an unrecognised type falls through to, which is
// how a moderation event comes to look like a new follower. Caught in Chromium
// on the first walkthrough of this type.
describe("NotificationTypeIcon", () => {
  it("gives video_unblocked the moderation shield, not the follow glyph", () => {
    const { container } = render(<NotificationTypeIcon type="video_unblocked" />);
    const blocked = render(<NotificationTypeIcon type="video_blocked" />).container.innerHTML;
    const follow = render(<NotificationTypeIcon type="follow" />).container.innerHTML;
    expect(container.innerHTML).toBe(blocked);
    expect(container.innerHTML).not.toBe(follow);
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
      "video_unblocked",
    ]) {
      expect(TYPE_LABELS[type], `missing TYPE_LABELS entry for ${type}`).toBeDefined();
    }
  });
});
