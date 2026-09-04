// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useShortWatchUrl } from "./use-short-watch-url";

const ID = "6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b";
const SID = "EjArDZ8v19uX6BigXbAx5p";

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
  it("shows the short alias for the canonical watch URL", () => {
    at(`/videos/${ID}`);
    renderHook(() => useShortWatchUrl(ID));
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0][2]).toBe(`/v/${SID}`);
    expect(window.location.pathname).toBe(`/v/${SID}`);
  });

  it("keeps the query string, so ?t= deep links survive the rewrite", () => {
    at(`/videos/${ID}?t=90`);
    renderHook(() => useShortWatchUrl(ID));
    expect(replaceState.mock.calls[0][2]).toBe(`/v/${SID}?t=90`);
  });

  it("preserves the router's history state instead of nulling it", () => {
    // The App Router keeps its routing record in history.state; replacing it
    // with null costs the next back/forward navigation its place.
    window.history.replaceState({ __NA: true, tree: ["x"] }, "", `/videos/${ID}`);
    replaceState.mockClear();
    renderHook(() => useShortWatchUrl(ID));
    expect(replaceState.mock.calls[0][0]).toEqual({ __NA: true, tree: ["x"] });
  });

  it("does nothing when the address bar is already short", () => {
    at(`/v/${SID}`);
    renderHook(() => useShortWatchUrl(ID));
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("does nothing for a video with no short form", () => {
    at("/videos/not-a-uuid");
    renderHook(() => useShortWatchUrl("not-a-uuid"));
    expect(replaceState).not.toHaveBeenCalled();
  });
});
