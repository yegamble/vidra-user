// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAsyncAction } from "./use-async-action";

afterEach(cleanup);

describe("useAsyncAction", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useAsyncAction(async () => {}, "Could not save."));
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("is busy while the action is in flight and idle once it settles", async () => {
    let release: (() => void) | undefined;
    const { result } = renderHook(() =>
      useAsyncAction(() => new Promise<void>((resolve) => (release = resolve)), "Could not save."),
    );

    let running: Promise<void>;
    act(() => {
      running = result.current.run();
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      release?.();
      await running;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reports the fallback message when the action throws", async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => {
        throw new Error("boom");
      }, "Could not save the chapters."),
    );

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).toBe("Could not save the chapters.");
  });

  it("resets busy when the SUCCESS path throws — the bug the hand-written catch-only copies had", async () => {
    const onDone = vi.fn(() => {
      throw new Error("a rerender blew up after the request succeeded");
    });
    const { result } = renderHook(() =>
      useAsyncAction(async () => {
        onDone();
      }, "Could not save."),
    );

    await act(async () => {
      await result.current.run();
    });
    expect(onDone).toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe("Could not save.");
  });

  it("clears a stale message when the next attempt starts", async () => {
    let shouldFail = true;
    const { result } = renderHook(() =>
      useAsyncAction(async () => {
        if (shouldFail) throw new Error("nope");
      }, "Could not save."),
    );

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).toBe("Could not save.");

    shouldFail = false;
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).toBeNull();
  });

  it("passes its arguments through to the action", async () => {
    const fn = vi.fn((word: string, count: number) => Promise.resolve(`${word}${count}`));
    const { result } = renderHook(() => useAsyncAction(fn, "Could not save."));
    await act(async () => {
      await result.current.run("word", 3);
    });
    expect(fn).toHaveBeenCalledWith("word", 3);
  });

  it("lets mapError name a specific failure, and falls through when it declines", async () => {
    const mapError = (err: unknown) =>
      (err as { status?: number }).status === 409 ? "That word is already on the list." : null;
    const failure: { status?: number } = { status: 409 };
    const { result } = renderHook(() =>
      useAsyncAction(
        async () => {
          throw failure;
        },
        "Could not add this word.",
        mapError,
      ),
    );

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).toBe("That word is already on the list.");

    failure.status = 500;
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).toBe("Could not add this word.");
  });

  it("exposes setError/clearError for the caller's own validation", () => {
    const { result } = renderHook(() => useAsyncAction(async () => {}, "Could not save."));
    act(() => result.current.setError("Enter a handle first."));
    expect(result.current.error).toBe("Enter a handle first.");
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
