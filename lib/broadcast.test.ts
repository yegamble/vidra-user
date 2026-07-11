// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  BROADCAST_BANNER_ID,
  BROADCAST_DISMISS_STORAGE_KEY,
  broadcastMessageHash,
  buildBroadcastDismissScript,
  isBroadcastDismissed,
  normalizeBroadcastLevel,
} from "./broadcast";

describe("broadcastMessageHash", () => {
  it("is stable for the same message", () => {
    expect(broadcastMessageHash("Maintenance tonight")).toBe(
      broadcastMessageHash("Maintenance tonight"),
    );
  });

  it("changes when the message is edited (dismissal must reset)", () => {
    expect(broadcastMessageHash("Maintenance tonight")).not.toBe(
      broadcastMessageHash("Maintenance tomorrow"),
    );
  });

  it("returns fixed-width lowercase hex, including for the empty string", () => {
    expect(broadcastMessageHash("")).toMatch(/^[0-9a-f]{8}$/);
    expect(broadcastMessageHash("hello **world**")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles non-ASCII content", () => {
    expect(broadcastMessageHash("Wartung heute Nacht — bitte später wiederkommen 🚧")).toMatch(
      /^[0-9a-f]{8}$/,
    );
  });
});

describe("normalizeBroadcastLevel", () => {
  it("passes the contract enum through", () => {
    expect(normalizeBroadcastLevel("info")).toBe("info");
    expect(normalizeBroadcastLevel("warning")).toBe("warning");
    expect(normalizeBroadcastLevel("error")).toBe("error");
  });

  it("falls back to info for unknown or absent values", () => {
    expect(normalizeBroadcastLevel(undefined)).toBe("info");
    expect(normalizeBroadcastLevel("")).toBe("info");
    expect(normalizeBroadcastLevel("critical")).toBe("info");
  });
});

describe("isBroadcastDismissed", () => {
  it("matches only the stored hash", () => {
    localStorage.clear();
    const hash = broadcastMessageHash("hello");
    expect(isBroadcastDismissed(hash)).toBe(false);
    localStorage.setItem(BROADCAST_DISMISS_STORAGE_KEY, hash);
    expect(isBroadcastDismissed(hash)).toBe(true);
    // An edited message (different hash) is NOT dismissed.
    expect(isBroadcastDismissed(broadcastMessageHash("hello!"))).toBe(false);
    localStorage.clear();
  });
});

describe("buildBroadcastDismissScript", () => {
  it("targets the banner element and compares the stored hash", () => {
    const hash = broadcastMessageHash("hello");
    const script = buildBroadcastDismissScript(hash);
    expect(script).toContain(JSON.stringify(BROADCAST_DISMISS_STORAGE_KEY));
    expect(script).toContain(JSON.stringify(BROADCAST_BANNER_ID));
    expect(script).toContain(JSON.stringify(hash));
    expect(script.startsWith("try{")).toBe(true);
    expect(script.endsWith("catch(e){}")).toBe(true);
  });
});
