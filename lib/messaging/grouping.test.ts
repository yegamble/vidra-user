import { describe, expect, it } from "vitest";

import { buildTimeline, type DisplayMessage, type TimelineItem } from "./grouping";

const ME = "me";
const PEER = "peer";
const BASE = new Date(2026, 6, 7, 12, 0, 0).getTime();
const NOW = new Date(BASE + 3 * 60 * 60 * 1000);

/** Minute offset from BASE as an ISO string. */
const at = (min: number) => new Date(BASE + min * 60_000).toISOString();

function msg(
  id: string,
  sender: string,
  min: number,
  extra: Partial<DisplayMessage> = {},
): DisplayMessage {
  return { id, sender_id: sender, body: `body ${id}`, created_at: at(min), ...extra };
}

const runs = (items: TimelineItem[]) => items.filter((i) => i.kind === "run");
const kinds = (items: TimelineItem[]) => items.map((i) => i.kind);

describe("buildTimeline", () => {
  it("returns nothing for an empty list", () => {
    expect(buildTimeline([], { meId: ME, now: NOW })).toEqual([]);
  });

  it("emits a leading separator then a single-message run", () => {
    const items = buildTimeline([msg("a", PEER, 0)], { meId: ME, now: NOW });
    expect(kinds(items)).toEqual(["separator", "run"]);
    const run = runs(items)[0];
    expect(run.mine).toBe(false);
    expect(run.messages).toHaveLength(1);
    expect(run.messages[0].position).toBe("single");
  });

  it("groups consecutive same-sender messages within 5 minutes into one run", () => {
    const items = buildTimeline([msg("a", PEER, 0), msg("b", PEER, 2)], {
      meId: ME,
      now: NOW,
    });
    expect(runs(items)).toHaveLength(1);
    const run = runs(items)[0];
    expect(run.messages.map((m) => m.message.id)).toEqual(["a", "b"]);
    expect(run.messages.map((m) => m.position)).toEqual(["first", "last"]);
  });

  it("assigns first/middle/last positions across a 3-message run", () => {
    const items = buildTimeline(
      [msg("a", PEER, 0), msg("b", PEER, 1), msg("c", PEER, 2)],
      { meId: ME, now: NOW },
    );
    expect(runs(items)[0].messages.map((m) => m.position)).toEqual([
      "first",
      "middle",
      "last",
    ]);
  });

  it("breaks the run when the sender changes (no separator when close in time)", () => {
    const items = buildTimeline([msg("a", PEER, 0), msg("b", ME, 2)], {
      meId: ME,
      now: NOW,
    });
    expect(kinds(items)).toEqual(["separator", "run", "run"]);
    expect(runs(items)[0].mine).toBe(false);
    expect(runs(items)[1].mine).toBe(true);
  });

  it("breaks the run on a >5-minute gap but inserts no separator under 60 minutes", () => {
    const items = buildTimeline([msg("a", PEER, 0), msg("b", PEER, 10)], {
      meId: ME,
      now: NOW,
    });
    expect(kinds(items)).toEqual(["separator", "run", "run"]);
  });

  it("inserts a time separator when the gap exceeds 60 minutes", () => {
    const items = buildTimeline([msg("a", PEER, 0), msg("b", PEER, 70)], {
      meId: ME,
      now: NOW,
    });
    expect(kinds(items)).toEqual(["separator", "run", "separator", "run"]);
  });

  it("inserts a separator on a day boundary", () => {
    const nextDay = new Date(2026, 6, 8, 12, 0, 0).toISOString();
    const items = buildTimeline(
      [msg("a", PEER, 0), { ...msg("b", PEER, 0), created_at: nextDay }],
      { meId: ME, now: new Date(2026, 6, 8, 15, 0, 0) },
    );
    expect(kinds(items)).toEqual(["separator", "run", "separator", "run"]);
  });

  it("marks the last own message covered by the peer's read watermark as Seen", () => {
    const items = buildTimeline(
      [msg("p", PEER, 0), msg("m1", ME, 2), msg("m2", ME, 3)],
      { meId: ME, peerReadId: "m2", now: NOW },
    );
    const mineRun = runs(items).find((r) => r.mine)!;
    const seen = mineRun.messages.filter((m) => m.seen).map((m) => m.message.id);
    expect(seen).toEqual(["m2"]);
  });

  it("shows no Seen when the watermark predates my last message", () => {
    const items = buildTimeline([msg("p", PEER, 0), msg("m1", ME, 2)], {
      meId: ME,
      peerReadId: "p",
      now: NOW,
    });
    expect(runs(items).flatMap((r) => r.messages).some((m) => m.seen)).toBe(false);
  });

  it("anchors Seen to the last DELIVERED message, skipping a pending copy", () => {
    const items = buildTimeline(
      [
        msg("p", PEER, 0),
        msg("m1", ME, 2),
        { ...msg("tmp", ME, 3), clientId: "tmp", sendState: "sending" },
      ],
      { meId: ME, peerReadId: "m1", now: NOW },
    );
    const seen = runs(items)
      .flatMap((r) => r.messages)
      .filter((m) => m.seen)
      .map((m) => m.message.id);
    expect(seen).toEqual(["m1"]);
  });

  it("places the NEW divider before the first unread peer message, splitting the run", () => {
    const items = buildTimeline(
      [msg("a", PEER, 0), msg("b", PEER, 2), msg("c", PEER, 4)],
      { meId: ME, unreadCount: 2, now: NOW },
    );
    expect(kinds(items)).toEqual(["separator", "run", "new-divider", "run"]);
    expect(runs(items)[0].messages.map((m) => m.message.id)).toEqual(["a"]);
    expect(runs(items)[1].messages.map((m) => m.message.id)).toEqual(["b", "c"]);
  });

  it("keeps a tombstoned message inside its run", () => {
    const items = buildTimeline(
      [msg("a", PEER, 0), { ...msg("b", PEER, 2), deleted: true, body: "[deleted]" }],
      { meId: ME, now: NOW },
    );
    expect(runs(items)).toHaveLength(1);
    expect(runs(items)[0].messages).toHaveLength(2);
  });
});
