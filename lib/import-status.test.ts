import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import type { ImportJob } from "@/lib/api";

import {
  IMPORT_STAGES,
  importActiveStage,
  importResolved,
  isImportsDisabledError,
} from "./import-status";

// A minimal import_job matching the openapi ImportJob shape; overrides pick the
// state/stage/resolver under test.
function job(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "job1",
    video_id: "v1",
    state: "running",
    resolver: "auto",
    attempts: 1,
    created_at: "2026-07-08T00:00:00Z",
    updated_at: "2026-07-08T00:00:00Z",
    ...overrides,
  };
}

describe("IMPORT_STAGES", () => {
  it("is the four-step rail in order", () => {
    expect(IMPORT_STAGES.map((s) => s.key)).toEqual([
      "queued",
      "metadata",
      "downloading",
      "processing",
    ]);
    expect(IMPORT_STAGES.map((s) => s.label)).toEqual([
      "Queued",
      "Fetching metadata",
      "Downloading",
      "Scanning & processing",
    ]);
  });
});

describe("importActiveStage", () => {
  it("maps a pending job to Queued (0)", () => {
    expect(importActiveStage(job({ state: "pending", stage: undefined }))).toBe(0);
  });

  it("maps a running job with no stage yet to Fetching metadata (1)", () => {
    expect(importActiveStage(job({ state: "running", stage: undefined }))).toBe(1);
  });

  it("maps the resolving stage to Fetching metadata (1)", () => {
    expect(importActiveStage(job({ state: "running", stage: "resolving" }))).toBe(1);
  });

  it("maps the downloading stage to Downloading (2)", () => {
    expect(importActiveStage(job({ state: "running", stage: "downloading" }))).toBe(2);
  });

  it("maps the processing stage to Scanning & processing (3)", () => {
    expect(importActiveStage(job({ state: "running", stage: "processing" }))).toBe(3);
  });

  it("returns -1 for terminal (done/failed) jobs — the rail is gone", () => {
    expect(importActiveStage(job({ state: "done", stage: undefined }))).toBe(-1);
    expect(importActiveStage(job({ state: "failed", stage: undefined }))).toBe(-1);
  });
});

describe("importResolved", () => {
  it("is false while still resolving (running, auto, no concrete stage)", () => {
    expect(importResolved(job({ state: "running", stage: "resolving", resolver: "auto" }))).toBe(false);
    expect(importResolved(job({ state: "running", stage: undefined, resolver: "auto" }))).toBe(false);
  });

  it("is true once a concrete stage is reported", () => {
    expect(importResolved(job({ state: "running", stage: "downloading", resolver: "auto" }))).toBe(true);
    expect(importResolved(job({ state: "running", stage: "processing", resolver: "auto" }))).toBe(true);
  });

  it("is true once the worker rewrote resolver from auto to a concrete value", () => {
    expect(importResolved(job({ state: "running", stage: "resolving", resolver: "ytdlp" }))).toBe(true);
    expect(importResolved(job({ state: "running", stage: undefined, resolver: "direct" }))).toBe(true);
  });

  it("is false for a not-yet-started (pending) job", () => {
    expect(importResolved(job({ state: "pending", stage: undefined, resolver: "auto" }))).toBe(false);
  });
});

describe("isImportsDisabledError", () => {
  it("recognises a 503 status", () => {
    expect(isImportsDisabledError(new ApiError({ status: 503, code: "whatever", message: "x" }))).toBe(true);
  });

  it("recognises the stable service_unavailable code", () => {
    expect(
      isImportsDisabledError(new ApiError({ status: 500, code: "service_unavailable", message: "x" })),
    ).toBe(true);
  });

  it("ignores other API errors and non-errors", () => {
    expect(isImportsDisabledError(new ApiError({ status: 422, code: "validation_error", message: "x" }))).toBe(false);
    expect(isImportsDisabledError(new Error("boom"))).toBe(false);
    expect(isImportsDisabledError(null)).toBe(false);
  });
});
