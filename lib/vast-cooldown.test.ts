// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { canPlayVast, markVastPlayed, VAST_PLAYED_AT_STORAGE_KEY } from "./vast-cooldown";

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-19T12:00:00Z")); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("persists actual playback across later requests and allows the exact expiry boundary", () => {
  expect(canPlayVast(30)).toBe(true);
  expect(localStorage.length).toBe(0); // Requesting an ad does not spend cooldown.
  markVastPlayed();
  expect(localStorage.getItem(VAST_PLAYED_AT_STORAGE_KEY)).toBe(String(Date.now()));
  expect(canPlayVast(30)).toBe(false); // Another video's request uses the same timestamp.
  vi.advanceTimersByTime(29_999);
  expect(canPlayVast(30)).toBe(false);
  vi.advanceTimersByTime(1);
  expect(canPlayVast(30)).toBe(true);
});

it("reads current shared storage rather than a cached per-video or per-module value", () => {
  expect(canPlayVast(60)).toBe(true);
  localStorage.setItem(VAST_PLAYED_AT_STORAGE_KEY, String(Date.now() - 1000)); // Another tab played.
  expect(canPlayVast(60)).toBe(false);
  localStorage.removeItem(VAST_PLAYED_AT_STORAGE_KEY);
  expect(canPlayVast(60)).toBe(true);
});

it.each(["", "garbage", "NaN", "Infinity", "-1", "1.5", "1e99", String(Number.MAX_SAFE_INTEGER + 1)])("ignores invalid stored timestamp %j", value => {
  localStorage.setItem(VAST_PLAYED_AT_STORAGE_KEY, value);
  expect(canPlayVast(60)).toBe(true);
});

it("ignores future timestamps, including a clock moved backwards", () => {
  localStorage.setItem(VAST_PLAYED_AT_STORAGE_KEY, String(Date.now() + 1));
  expect(canPlayVast(60)).toBe(true);
  markVastPlayed();
  vi.setSystemTime(Date.now() - 60_000);
  expect(canPlayVast(60)).toBe(true);
});

it.each([0, -1, NaN, Infinity, Number.MAX_VALUE])("does not gate playback for disabled or invalid cooldown %s", seconds => {
  markVastPlayed();
  expect(canPlayVast(seconds)).toBe(true);
});

it("fails open when privacy settings block storage reads or writes", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(canPlayVast(60)).toBe(true);
  expect(() => markVastPlayed()).not.toThrow();
});

it.each([NaN, -1, Number.MAX_SAFE_INTEGER + 1])("does not persist or enforce an invalid clock %s", now => {
  localStorage.setItem(VAST_PLAYED_AT_STORAGE_KEY, "1");
  vi.spyOn(Date, "now").mockReturnValue(now);
  expect(canPlayVast(60)).toBe(true);
  markVastPlayed();
  expect(localStorage.getItem(VAST_PLAYED_AT_STORAGE_KEY)).toBe("1");
});
