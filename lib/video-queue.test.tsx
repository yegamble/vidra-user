// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Video } from "@/lib/api";
import {
  clearQueue,
  dequeueVideo,
  enqueueVideo,
  removeVideo,
  resetVideoQueueForTests,
  useVideoQueue,
} from "@/lib/video-queue";

const STORAGE_KEY = "vidra.playback-queue.v1";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

function video(id: string, remote = false): Video {
  return {
    id,
    channel_id: "channel-1",
    title: `Video ${id}`,
    description: "",
    privacy: "public",
    state: "published",
    created_at: "2026-01-01T00:00:00Z",
    remote,
  } as Video;
}

function QueueProbe() {
  const queue = useVideoQueue();
  return <output aria-label="queue">{queue.map((item) => `${item.id}:${Boolean(item.remote)}`).join(",")}</output>;
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  resetVideoQueueForTests();
});

afterEach(() => {
  cleanup();
  resetVideoQueueForTests();
});

describe("video playback queue", () => {
  it("appends in FIFO order, updates subscribers, and rejects duplicates", () => {
    render(<QueueProbe />);

    expect(screen.getByLabelText("queue").textContent).toBe("");
    act(() => {
      expect(enqueueVideo(video("first"))).toBe(true);
      expect(enqueueVideo(video("second"))).toBe(true);
      expect(enqueueVideo(video("first"))).toBe(false);
    });

    expect(screen.getByLabelText("queue").textContent).toBe("first:false,second:false");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toHaveLength(2);
  });

  it("treats local and remote videos with the same id as separate queue entries", () => {
    render(<QueueProbe />);

    act(() => {
      expect(enqueueVideo(video("shared"))).toBe(true);
      expect(enqueueVideo(video("shared", true))).toBe(true);
    });
    expect(screen.getByLabelText("queue").textContent).toBe("shared:false,shared:true");

    act(() => dequeueVideo("shared", true));
    expect(screen.getByLabelText("queue").textContent).toBe("shared:false");

    act(() => dequeueVideo("shared"));
    expect(screen.getByLabelText("queue").textContent).toBe("");
  });

  it("recovers from malformed persisted data and keeps only valid queue items", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([video("valid"), null, { id: "missing-title" }, { title: "missing id" }]),
    );
    resetVideoQueueForTests();
    // reset removes storage by design, so restore the fixture after invalidating
    // the module snapshot to exercise its persisted-data parser.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([video("valid"), null, { id: "missing-title" }, { title: "missing id" }]),
    );

    render(<QueueProbe />);
    expect(screen.getByLabelText("queue").textContent).toBe("valid:false");
  });

  it("removeVideo drops the matching entry, persists, and notifies subscribers", () => {
    render(<QueueProbe />);
    act(() => {
      enqueueVideo(video("a"));
      enqueueVideo(video("b"));
      enqueueVideo(video("b", true));
    });
    expect(screen.getByLabelText("queue").textContent).toBe("a:false,b:false,b:true");

    // Removes only the local "b" (the remote "b" is a distinct entry) and
    // rewrites storage — the subscriber (QueueProbe) re-renders from the store.
    act(() => removeVideo("b", false));
    expect(screen.getByLabelText("queue").textContent).toBe("a:false,b:true");
    expect(
      (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Video[]).map(
        (v) => `${v.id}:${Boolean(v.remote)}`,
      ),
    ).toEqual(["a:false", "b:true"]);

    // A no-op removal (absent id) leaves the queue untouched.
    act(() => removeVideo("missing"));
    expect(screen.getByLabelText("queue").textContent).toBe("a:false,b:true");
  });

  it("clearQueue empties the queue, persists [], and notifies subscribers", () => {
    render(<QueueProbe />);
    act(() => {
      enqueueVideo(video("a"));
      enqueueVideo(video("b"));
    });
    expect(screen.getByLabelText("queue").textContent).toBe("a:false,b:false");

    act(() => clearQueue());
    expect(screen.getByLabelText("queue").textContent).toBe("");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual([]);
  });
});
