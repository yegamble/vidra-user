// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the API client so no real request is made; the flush path calls
// api.postSearchEvents and (on success) fires the history-flushed signal.
const postSearchEvents = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
vi.mock("@/lib/api", () => ({
  api: { postSearchEvents: (...args: unknown[]) => postSearchEvents(...args) },
}));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  flush,
  resetSearchEventsForTest,
  subscribeSearchHistoryFlushed,
  trackSearchEvent,
} from "./search-events";

// Let the postSearchEvents promise and its `.then`/`.catch` continuation settle.
async function settle() {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

beforeEach(() => {
  resetSearchEventsForTest();
  postSearchEvents.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  resetSearchEventsForTest();
  vi.clearAllMocks();
});

describe("subscribeSearchHistoryFlushed", () => {
  it("notifies once a submitted-search batch is accepted by the server", async () => {
    const seen = vi.fn();
    const unsubscribe = subscribeSearchHistoryFlushed(seen);

    trackSearchEvent({ type: "search.submitted", query: "cats" });
    flush();
    await settle();

    expect(postSearchEvents).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not notify for a batch that writes nothing to history", async () => {
    const seen = vi.fn();
    const unsubscribe = subscribeSearchHistoryFlushed(seen);

    trackSearchEvent({ type: "video.impression", video_id: "v1", context: "home" });
    flush();
    await settle();

    expect(postSearchEvents).toHaveBeenCalledTimes(1);
    expect(seen).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("does not notify when the POST fails (nothing changed on the server)", async () => {
    postSearchEvents.mockRejectedValueOnce(new Error("boom"));
    const seen = vi.fn();
    const unsubscribe = subscribeSearchHistoryFlushed(seen);

    trackSearchEvent({ type: "search.submitted", query: "cats" });
    flush();
    await settle();

    expect(seen).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("stops notifying after unsubscribe", async () => {
    const seen = vi.fn();
    const unsubscribe = subscribeSearchHistoryFlushed(seen);
    unsubscribe();

    trackSearchEvent({ type: "search.submitted", query: "cats" });
    flush();
    await settle();

    expect(seen).not.toHaveBeenCalled();
  });

  it("keeps firing telemetry even if a listener throws", async () => {
    const bad = vi.fn(() => {
      throw new Error("listener blew up");
    });
    const good = vi.fn();
    const unsubBad = subscribeSearchHistoryFlushed(bad);
    const unsubGood = subscribeSearchHistoryFlushed(good);

    trackSearchEvent({ type: "search.submitted", query: "cats" });
    flush();
    await settle();

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    unsubBad();
    unsubGood();
  });
});
