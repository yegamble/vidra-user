import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import type { ChannelSyncState } from "@/lib/api";

import {
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
