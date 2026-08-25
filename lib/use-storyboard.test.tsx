// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { videoStoryboardImageUrl } from "@/lib/api";
import { useStoryboard } from "./use-storyboard";

const VTT = `WEBVTT

00:00:00.000 --> 00:00:02.000
storyboard.jpg#xywh=0,0,160,90

00:00:02.000 --> 00:00:04.000
storyboard.jpg#xywh=160,0,160,90
`;

function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

// Drain the whole fetch promise chain (a macrotask runs after every pending
// microtask), so an assertion about what the hook did NOT do afterwards is
// reading a settled hook rather than racing it.
function settle() {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useStoryboard", () => {
  it("returns null and never fetches when the video has no storyboard", () => {
    const fetchFn = stubFetch(async () => new Response("", { status: 404 }));
    const { result } = renderHook(() => useStoryboard("v1", false));
    expect(result.current).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("lazily fetches the VTT only on activate(), then resolves cues (idempotent)", async () => {
    const fetchFn = stubFetch(async () => new Response(VTT, { status: 200 }));
    const { result } = renderHook(() => useStoryboard("v1", true));
    expect(result.current).not.toBeNull();
    expect(result.current!.spriteUrl).toBe(videoStoryboardImageUrl("v1"));
    // No fetch, no cues until the seek bar activates the preview.
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current!.cueAt(1)).toBeNull();

    act(() => result.current!.activate());
    await waitFor(() => expect(result.current!.cueAt(1)).not.toBeNull());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // t=3s lands in the second tile (x=160).
    expect(result.current!.cueAt(3)).toMatchObject({ x: 160, w: 160, h: 90 });

    // A second activate() does not re-fetch.
    act(() => result.current!.activate());
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("degrades to no cues when the VTT is missing", async () => {
    const fetchFn = stubFetch(async () => new Response("", { status: 404 }));
    const { result } = renderHook(() => useStoryboard("v1", true));
    act(() => result.current!.activate());
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(result.current!.cueAt(1)).toBeNull();
  });

  it("never re-asks after a 404 — the server already answered", async () => {
    const fetchFn = stubFetch(async () => new Response("", { status: 404 }));
    const { result } = renderHook(() => useStoryboard("v1", true));
    act(() => result.current!.activate());
    await settle();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Every later hover is silent: "there is no storyboard" is a final answer.
    act(() => result.current!.activate());
    act(() => result.current!.activate());
    await settle();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current!.cueAt(1)).toBeNull();
  });

  it("retries once more on the next hover when the network never answered", async () => {
    let attempt = 0;
    const fetchFn = stubFetch(async () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError("Failed to fetch");
      return new Response(VTT, { status: 200 });
    });
    const { result } = renderHook(() => useStoryboard("v1", true));

    act(() => result.current!.activate());
    await settle();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current!.cueAt(1)).toBeNull();

    // The connection failed, not the answer, so the hook is not dead for this
    // video: the next hover asks again and this time the cues arrive.
    act(() => result.current!.activate());
    await waitFor(() => expect(result.current!.cueAt(1)).not.toBeNull());
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
