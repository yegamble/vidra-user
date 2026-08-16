import { describe, expect, it, beforeEach } from "vitest";

import type { QuotaStatus } from "@/lib/api";
import {
  MAX_CONCURRENT_UPLOADS,
  activeCount,
  allSettled,
  makeBatchItems,
  overQuotaIds,
  queueReducer,
  resetBatchIdSeq,
  selectStartable,
  titleFromFilename,
  type BatchItem,
  type BatchItemStatus,
} from "./upload-queue";

// A BatchItem with an arbitrary declared size, decoupled from the (empty) File so
// the quota/parallelism tests can use GB-scale totals without allocating buffers.
function item(id: string, status: BatchItemStatus, total = 10, extra: Partial<BatchItem> = {}): BatchItem {
  return {
    id,
    file: new File([], `${id}.mp4`, { type: "video/mp4" }),
    title: id,
    status,
    loaded: 0,
    total,
    percent: 0,
    ...extra,
  };
}

function quota(used: number, total: number | null): QuotaStatus {
  return { used_bytes: used, quota_bytes: total, daily_used_bytes: 0, daily_quota_bytes: null };
}

describe("titleFromFilename", () => {
  it("drops a single trailing extension", () => {
    expect(titleFromFilename("alps-diary.mov")).toBe("alps-diary");
    expect(titleFromFilename("clip.mp4")).toBe("clip");
  });
  it("keeps everything before the LAST dot for a multi-dot name", () => {
    expect(titleFromFilename("promo.final.v2.mp4")).toBe("promo.final.v2");
  });
  it("leaves an extension-less name unchanged", () => {
    expect(titleFromFilename("rawfootage")).toBe("rawfootage");
  });
  it("does not strip a leading-dot (dotfile) name", () => {
    expect(titleFromFilename(".mp4")).toBe(".mp4");
  });
  it("falls back to Untitled for a blank name", () => {
    expect(titleFromFilename("   ")).toBe("Untitled");
  });
});

describe("makeBatchItems", () => {
  beforeEach(() => resetBatchIdSeq());

  it("builds one queued row per file with a filename-derived title and unique ids", () => {
    const files = [
      new File([new Uint8Array(4)], "one.mp4", { type: "video/mp4" }),
      new File([new Uint8Array(8)], "two.mov", { type: "video/mp4" }),
    ];
    const items = makeBatchItems(files);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "one", status: "queued", total: 4, percent: 0, loaded: 0 });
    expect(items[1]).toMatchObject({ title: "two", status: "queued", total: 8 });
    expect(items[0].id).not.toBe(items[1].id);
  });
});

describe("queueReducer transitions", () => {
  it("enqueue appends and de-dupes by id", () => {
    const a = item("a", "queued");
    const b = item("b", "queued");
    let state = queueReducer([], { type: "enqueue", items: [a, b] });
    expect(state.map((i) => i.id)).toEqual(["a", "b"]);
    // Re-enqueuing an existing id (plus a new one) only appends the new one.
    state = queueReducer(state, { type: "enqueue", items: [a, item("c", "queued")] });
    expect(state.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("setTitle edits a queued row but never an in-flight or done one", () => {
    const state = [item("a", "queued"), item("b", "uploading"), item("c", "done")];
    expect(queueReducer(state, { type: "setTitle", id: "a", title: "New" })[0].title).toBe("New");
    expect(queueReducer(state, { type: "setTitle", id: "b", title: "x" })[1].title).toBe("b");
    expect(queueReducer(state, { type: "setTitle", id: "c", title: "x" })[2].title).toBe("c");
  });

  it("start moves queued → uploading and resets progress; no-op otherwise", () => {
    const state = [item("a", "queued", 10, { error: "old" }), item("b", "done")];
    const started = queueReducer(state, { type: "start", id: "a" });
    expect(started[0]).toMatchObject({ status: "uploading", percent: 0, loaded: 0, error: undefined });
    // Cannot start a done row.
    expect(queueReducer(state, { type: "start", id: "b" })).toBe(state);
  });

  it("progress only updates an uploading row", () => {
    const state = [item("a", "uploading", 100), item("b", "queued", 100)];
    const p = queueReducer(state, { type: "progress", id: "a", loaded: 50, total: 100, percent: 50 });
    expect(p[0]).toMatchObject({ loaded: 50, percent: 50 });
    // A queued row ignores progress.
    expect(queueReducer(state, { type: "progress", id: "b", loaded: 1, total: 100, percent: 1 })).toBe(state);
  });

  it("succeed marks done at 100% with the video id", () => {
    const state = [item("a", "uploading", 100, { loaded: 40, percent: 40 })];
    const done = queueReducer(state, { type: "succeed", id: "a", videoId: "v1" });
    expect(done[0]).toMatchObject({ status: "done", percent: 100, loaded: 100, videoId: "v1" });
  });

  it("fail records a terminal error", () => {
    const state = [item("a", "uploading")];
    expect(queueReducer(state, { type: "fail", id: "a", error: "boom" })[0]).toMatchObject({
      status: "failed",
      error: "boom",
    });
  });

  it("requeue (limit backoff) returns an uploading row to queued, not failed", () => {
    const state = [item("a", "uploading", 10, { loaded: 4, percent: 40 }), item("b", "queued")];
    const back = queueReducer(state, { type: "requeue", id: "a" });
    expect(back[0]).toMatchObject({ status: "queued", loaded: 0, percent: 0, error: undefined });
    // Requeue is a no-op on a row that is not uploading (a queued row stays queued).
    expect(queueReducer(state, { type: "requeue", id: "b" })).toBe(state);
  });

  it("retry re-queues a failed or cancelled row; no-op on a queued one", () => {
    const state = [item("a", "failed", 10, { error: "x" }), item("b", "cancelled"), item("c", "queued")];
    expect(queueReducer(state, { type: "retry", id: "a" })[0]).toMatchObject({ status: "queued", error: undefined });
    expect(queueReducer(state, { type: "retry", id: "b" })[1].status).toBe("queued");
    expect(queueReducer(state, { type: "retry", id: "c" })).toBe(state);
  });

  it("cancel and remove", () => {
    const state = [item("a", "uploading"), item("b", "queued")];
    expect(queueReducer(state, { type: "cancel", id: "a" })[0].status).toBe("cancelled");
    expect(queueReducer(state, { type: "remove", id: "b" }).map((i) => i.id)).toEqual(["a"]);
  });

  it("markOverQuota flags only the listed, still-queued rows", () => {
    const state = [item("a", "queued"), item("b", "queued"), item("c", "uploading")];
    const marked = queueReducer(state, { type: "markOverQuota", ids: ["a", "c"] });
    expect(marked[0].status).toBe("over_quota");
    expect(marked[1].status).toBe("queued");
    // An uploading row is never retroactively marked over quota.
    expect(marked[2].status).toBe("uploading");
  });
});

describe("selectStartable — bounded parallelism", () => {
  it("starts up to the cap when nothing is uploading", () => {
    const state = [item("a", "queued"), item("b", "queued"), item("c", "queued")];
    expect(selectStartable(state, 2)).toEqual([state[0], state[1]]);
  });

  it("leaves room for the in-flight rows (cap minus active)", () => {
    const state = [item("a", "uploading"), item("b", "queued"), item("c", "queued")];
    expect(selectStartable(state, 2)).toEqual([state[1]]);
  });

  it("returns nothing once the cap is saturated", () => {
    const state = [item("a", "uploading"), item("b", "uploading"), item("c", "queued")];
    expect(selectStartable(state, 2)).toEqual([]);
  });

  it("ignores non-queued rows and preserves order", () => {
    const state = [
      item("a", "done"),
      item("b", "over_quota"),
      item("c", "queued"),
      item("d", "failed"),
      item("e", "queued"),
    ];
    expect(selectStartable(state, MAX_CONCURRENT_UPLOADS)).toEqual([state[2], state[4]]);
  });

  it("activeCount counts only uploading rows", () => {
    expect(activeCount([item("a", "uploading"), item("b", "queued"), item("c", "uploading")])).toBe(2);
  });
});

describe("allSettled", () => {
  it("is false while any row is queued or uploading", () => {
    expect(allSettled([item("a", "done"), item("b", "queued")])).toBe(false);
    expect(allSettled([item("a", "uploading")])).toBe(false);
  });
  it("is true when every row is done/failed/cancelled/over_quota", () => {
    expect(allSettled([item("a", "done"), item("b", "failed"), item("c", "over_quota")])).toBe(true);
  });
});

describe("overQuotaIds — quota preflight", () => {
  it("returns [] when the quota is unlimited or not loaded", () => {
    const items = [item("a", "queued", 10)];
    expect(overQuotaIds(items, quota(0, null))).toEqual([]);
    expect(overQuotaIds(items, null)).toEqual([]);
  });

  it("marks the rows whose cumulative size crosses the quota", () => {
    // used 6 of 10 → 4 free. a(3) fits (proj 9), b(3) does not (would be 12).
    const items = [item("a", "queued", 3), item("b", "queued", 3)];
    expect(overQuotaIds(items, quota(6, 10))).toEqual(["b"]);
  });

  it("greedily admits a smaller later file after a too-big one is skipped", () => {
    // used 0 of 10. a(8) fits (proj 8). b(5) does NOT fit (13). c(2) still fits (10).
    const items = [item("a", "queued", 8), item("b", "queued", 5), item("c", "queued", 2)];
    expect(overQuotaIds(items, quota(0, 10))).toEqual(["b"]);
  });

  it("ignores rows that are not queued", () => {
    const items = [item("a", "uploading", 100), item("b", "queued", 3)];
    // The uploading row's size is not projected; b(3) fits in the 4 free bytes.
    expect(overQuotaIds(items, quota(6, 10))).toEqual([]);
  });
});
