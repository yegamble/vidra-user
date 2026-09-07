import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import type { ChannelSync, ChannelSyncState } from "@/lib/api";

import {
  channelSyncBackoffNote,
  channelSyncStateClass,
  channelSyncStateLabel,
  isChannelSyncDisabledError,
  validateChannelSyncUrl,
} from "./channel-sync";

describe("channelSyncStateLabel", () => {
  it("maps every contract state to a human label", () => {
    expect(channelSyncStateLabel("waiting_first_run")).toBe("Waiting first run");
    expect(channelSyncStateLabel("syncing")).toBe("Syncing");
    expect(channelSyncStateLabel("idle")).toBe("Idle");
    expect(channelSyncStateLabel("failed")).toBe("Failed");
  });

  it("falls back to the waiting label for an unknown state", () => {
    expect(channelSyncStateLabel("weird" as ChannelSyncState)).toBe("Waiting first run");
  });
});

describe("channelSyncStateClass", () => {
  it("maps states onto the studio StateBadge token vocabulary", () => {
    expect(channelSyncStateClass("waiting_first_run")).toBe("bg-surface-strong text-fg-muted");
    expect(channelSyncStateClass("syncing")).toBe("bg-warning/15 text-warning");
    expect(channelSyncStateClass("idle")).toBe("bg-success/15 text-success");
    // Failed uses the dedicated danger-surface (not the low-contrast danger/15 fill).
    expect(channelSyncStateClass("failed")).toBe("bg-danger-surface text-danger");
  });

  it("falls back to the muted-strong recipe for an unknown state", () => {
    expect(channelSyncStateClass("weird" as ChannelSyncState)).toBe("bg-surface-strong text-fg-muted");
  });
});

describe("validateChannelSyncUrl", () => {
  it("accepts a trimmed public http(s) URL", () => {
    expect(validateChannelSyncUrl("https://www.youtube.com/@example")).toBeNull();
    expect(validateChannelSyncUrl("  http://vids.example/c/ada  ")).toBeNull();
  });

  it("rejects an empty / whitespace-only value", () => {
    expect(validateChannelSyncUrl("")).toBe("Enter the channel URL to mirror.");
    expect(validateChannelSyncUrl("   ")).toBe("Enter the channel URL to mirror.");
  });

  it("rejects an unparseable URL", () => {
    expect(validateChannelSyncUrl("not a url")).toBe("Enter a valid http(s) URL.");
  });

  it("rejects a non-http(s) scheme (the URL tab is http(s)-only — no magnet/ftp)", () => {
    expect(validateChannelSyncUrl("magnet:?xt=urn:btih:abc")).toBe(
      "Only http(s) URLs are supported.",
    );
    expect(validateChannelSyncUrl("ftp://example.com/feed")).toBe(
      "Only http(s) URLs are supported.",
    );
  });
});

describe("isChannelSyncDisabledError", () => {
  it("is true for a 503 and for the stable service_unavailable code", () => {
    expect(
      isChannelSyncDisabledError(new ApiError({ status: 503, code: "service_unavailable", message: "off" })),
    ).toBe(true);
    // Defensive: the stable code even if a proxy rewrote the status.
    expect(
      isChannelSyncDisabledError(new ApiError({ status: 500, code: "service_unavailable", message: "off" })),
    ).toBe(true);
  });

  it("is false for other API errors and non-errors", () => {
    expect(
      isChannelSyncDisabledError(new ApiError({ status: 422, code: "validation_error", message: "bad url" })),
    ).toBe(false);
    expect(isChannelSyncDisabledError(new Error("boom"))).toBe(false);
    expect(isChannelSyncDisabledError(null)).toBe(false);
  });
});

// channelSyncBackoffNote — the sentence that makes a failing sync legible to its
// owner. Without it a row that says "Failed" gives no clue whether the next
// attempt is in an hour or a day, which is exactly the question the backoff
// (vidra-core migration 0135) makes worth asking.
describe("channelSyncBackoffNote", () => {
  const now = new Date("2026-09-07T12:00:00Z");
  const sync = (over: Partial<ChannelSync>): ChannelSync =>
    ({
      id: "s1",
      channel_id: "c1",
      external_channel_url: "https://example.com/@chan",
      state: "failed",
      failure_count: 1,
      next_run_at: "2026-09-07T13:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-07T12:00:00Z",
      ...over,
    }) as ChannelSync;

  it("is null for a healthy sync — no failures, nothing to explain", () => {
    expect(channelSyncBackoffNote(sync({ state: "idle", failure_count: 0 }), now)).toBeNull();
  });

  it("is null while a run is in progress (next_run_at is the lease, not an attempt)", () => {
    expect(channelSyncBackoffNote(sync({ state: "syncing", failure_count: 3 }), now)).toBeNull();
  });

  it("names one failed run and when the next attempt lands", () => {
    expect(channelSyncBackoffNote(sync({ failure_count: 1 }), now)).toBe(
      "1 failed run · next attempt in 1h",
    );
  });

  it("shows the widening gap after repeated failures", () => {
    expect(
      channelSyncBackoffNote(
        sync({ failure_count: 4, next_run_at: "2026-09-08T04:00:00Z" }),
        now,
      ),
    ).toBe("4 failed runs in a row · next attempt in 16h");
  });

  it("says the attempt is due when the schedule has already passed (e.g. after Sync now)", () => {
    expect(
      channelSyncBackoffNote(sync({ failure_count: 2, next_run_at: "2026-09-07T11:59:00Z" }), now),
    ).toBe("2 failed runs in a row · next attempt due now");
  });

  it("rounds the countdown so a 4h backoff read a moment later still says 4h", () => {
    // A scheduled moment is always read AFTER it was scheduled: flooring would
    // render every backoff one unit short, and a 4h gap would never say "4h".
    expect(
      channelSyncBackoffNote(
        sync({ failure_count: 3, next_run_at: "2026-09-07T15:59:00Z" }),
        now,
      ),
    ).toBe("3 failed runs in a row · next attempt in 4h");
  });

  it("degrades to the count alone when the backend sent no schedule", () => {
    // An older core, or a field a proxy stripped: never render "in NaN".
    expect(
      channelSyncBackoffNote(sync({ failure_count: 2, next_run_at: undefined as unknown as string }), now),
    ).toBe("2 failed runs in a row");
  });
});
