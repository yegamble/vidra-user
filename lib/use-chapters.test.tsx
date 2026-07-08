// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { useChapters } from "./use-chapters";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useChapters", () => {
  it("returns null and never fetches when the video has no chapters", () => {
    const spy = vi.spyOn(api, "getVideoChapters");
    const { result } = renderHook(() => useChapters("v1", false));
    expect(result.current).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("eagerly fetches on mount and resolves the ascending set + a by-time lookup", async () => {
    const spy = vi.spyOn(api, "getVideoChapters").mockResolvedValue({
      chapters: [
        { start_seconds: 0, title: "Intro" },
        { start_seconds: 60, title: "The Build" },
      ],
    });
    const { result } = renderHook(() => useChapters("v1", true));
    // Non-null immediately (the object exists so the seek bar can bind), but empty
    // until the fetch resolves.
    expect(result.current).not.toBeNull();
    expect(result.current!.chapters).toEqual([]);

    await waitFor(() => expect(result.current!.chapters.length).toBe(2));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current!.chapterAt(75)?.title).toBe("The Build");
    expect(result.current!.chapterAt(10)?.title).toBe("Intro");
  });

  it("degrades to an empty (non-null) set when the fetch fails", async () => {
    vi.spyOn(api, "getVideoChapters").mockRejectedValue(new Error("404"));
    const { result } = renderHook(() => useChapters("v1", true));
    // Give the rejected promise a tick to settle; the set stays empty but usable.
    await waitFor(() => expect(api.getVideoChapters).toHaveBeenCalled());
    expect(result.current).not.toBeNull();
    expect(result.current!.chapters).toEqual([]);
    expect(result.current!.chapterAt(30)).toBeNull();
  });
});
