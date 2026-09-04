// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useShortWatchUrl } from "./use-short-watch-url";

const ID = "6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b";
const CODE = "abcdefghijk";

let replaceState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  replaceState = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function at(url: string) {
  window.history.replaceState(null, "", url);
  replaceState.mockClear();
}

describe("useShortWatchUrl", () => {
  it("shows the canonical short link when the bar is on the uuid form", () => {
    at(`/videos/${ID}`);
    renderHook(() => useShortWatchUrl(CODE));
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0][2]).toBe(`/v/${CODE}`);
    expect(window.location.pathname).toBe(`/v/${CODE}`);
  });

  // The address bar KEEPS ?t= while the canonical STRIPS it — a start time
  // names a moment in a video, not a different video.
  it("keeps the query string, so ?t= deep links survive the rewrite", () => {
    at(`/videos/${ID}?t=90`);
    renderHook(() => useShortWatchUrl(CODE));
    expect(replaceState.mock.calls[0][2]).toBe(`/v/${CODE}?t=90`);
  });

  it("keeps the hash too", () => {
    at(`/videos/${ID}?t=90#comments`);
    renderHook(() => useShortWatchUrl(CODE));
    expect(replaceState.mock.calls[0][2]).toBe(`/v/${CODE}?t=90#comments`);
  });

  it("preserves the router's history state instead of nulling it", () => {
    // The App Router keeps its routing record in history.state; replacing it
    // with null costs the next back/forward navigation its place.
    window.history.replaceState({ __NA: true, tree: ["x"] }, "", `/videos/${ID}`);
    replaceState.mockClear();
    renderHook(() => useShortWatchUrl(CODE));
    expect(replaceState.mock.calls[0][0]).toEqual({ __NA: true, tree: ["x"] });
  });

  it("does nothing when the address bar is already short", () => {
    at(`/v/${CODE}`);
    renderHook(() => useShortWatchUrl(CODE));
    expect(replaceState).not.toHaveBeenCalled();
  });

  // A remote/federated video has no local code, and core sends "" for those
  // rows; neither may produce a "/v/" URL.
  it("does nothing for a video with no code", () => {
    at(`/videos/${ID}`);
    renderHook(() => useShortWatchUrl(undefined));
    expect(replaceState).not.toHaveBeenCalled();
    renderHook(() => useShortWatchUrl(""));
    expect(replaceState).not.toHaveBeenCalled();
  });

  // Every other surface that renders a watch view keeps its own URL.
  it("does nothing on the embed, live and remote surfaces", () => {
    for (const path of [`/embed/${ID}`, `/live/${ID}`, `/remote/${ID}`]) {
      at(path);
      renderHook(() => useShortWatchUrl(CODE));
      expect(replaceState).not.toHaveBeenCalled();
    }
  });
});
