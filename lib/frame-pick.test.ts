import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";

import {
  canFramePick,
  clampFrameTime,
  FRAME_PICK_EPSILON,
  frameThumbnailError,
} from "./frame-pick";

describe("canFramePick", () => {
  it("is true only for a known, finite, positive duration", () => {
    expect(canFramePick(30)).toBe(true);
    expect(canFramePick(0.5)).toBe(true);
  });

  it("is false for an unknown / non-positive / non-finite duration", () => {
    expect(canFramePick(undefined)).toBe(false);
    expect(canFramePick(null)).toBe(false);
    expect(canFramePick(0)).toBe(false);
    expect(canFramePick(-5)).toBe(false);
    expect(canFramePick(Number.NaN)).toBe(false);
    expect(canFramePick(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("clampFrameTime", () => {
  it("passes through a value inside the range", () => {
    expect(clampFrameTime(5, 30)).toBe(5);
    expect(clampFrameTime(12.5, 30)).toBe(12.5);
  });

  it("clamps a negative / NaN input to 0", () => {
    expect(clampFrameTime(-1, 30)).toBe(0);
    expect(clampFrameTime(Number.NaN, 30)).toBe(0);
  });

  it("pulls the end strictly below duration by one epsilon", () => {
    expect(clampFrameTime(30, 30)).toBeCloseTo(30 - FRAME_PICK_EPSILON, 6);
    expect(clampFrameTime(100, 30)).toBeCloseTo(30 - FRAME_PICK_EPSILON, 6);
  });

  it("keeps the clamped end strictly less than duration", () => {
    expect(clampFrameTime(30, 30)).toBeLessThan(30);
  });

  it("yields 0 for an unknown / non-positive duration", () => {
    expect(clampFrameTime(5, undefined)).toBe(0);
    expect(clampFrameTime(5, null)).toBe(0);
    expect(clampFrameTime(5, 0)).toBe(0);
    expect(clampFrameTime(5, -10)).toBe(0);
  });

  it("never exceeds a sub-epsilon duration", () => {
    // duration smaller than the epsilon: max floors at 0.
    expect(clampFrameTime(0.05, 0.05)).toBe(0);
  });
});

describe("frameThumbnailError", () => {
  function apiError(status: number, code = "err", message = "boom"): ApiError {
    return new ApiError({ status, code, message });
  }

  it("maps 409 to the still-processing sentence", () => {
    expect(frameThumbnailError(apiError(409))).toMatch(/still processing/i);
  });

  it("maps 422 to the out-of-range sentence", () => {
    expect(frameThumbnailError(apiError(422))).toMatch(/outside the video/i);
  });

  it("maps 503 to the not-available sentence", () => {
    expect(frameThumbnailError(apiError(503))).toMatch(/isn’t available on this instance/i);
  });

  it("falls through to the domain default for other errors", () => {
    // A 5xx body is never echoed; the domain default is used.
    expect(frameThumbnailError(apiError(500))).toMatch(/Could not set the thumbnail from that frame/i);
    // A non-ApiError value also uses the default.
    expect(frameThumbnailError(new Error("nope"))).toMatch(
      /Could not set the thumbnail from that frame/i,
    );
  });

  it("prefers the backend's human message for a 4xx it does not special-case", () => {
    expect(frameThumbnailError(apiError(404, "not_found", "no such video"))).toBe("no such video");
  });
});
