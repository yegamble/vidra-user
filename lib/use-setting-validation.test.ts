// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ validateInstanceSettings: vi.fn() }));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      validateInstanceSettings: mocks.validateInstanceSettings,
    },
  };
});

import { useSettingValidation } from "./use-setting-validation";

beforeEach(() => {
  mocks.validateInstanceSettings.mockResolvedValue({ fields: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

/** Advance past the debounce window and let the resulting promise settle. */
async function settleDebounce() {
  // advanceTimersByTimeAsync yields between timers, so the promise chain the
  // fired probe kicks off settles before we assert.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}

describe("useSettingValidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("coalesces a burst of blurs into one request carrying the last value", async () => {
    const { result } = renderHook(() => useSettingValidation());

    act(() => {
      result.current.validateKey("instance_name", "a");
      result.current.validateKey("instance_name", "ab");
      result.current.validateKey("instance_name", "abc");
    });
    // Nothing has gone out yet — the window is still open.
    expect(mocks.validateInstanceSettings).not.toHaveBeenCalled();

    await settleDebounce();

    expect(mocks.validateInstanceSettings).toHaveBeenCalledTimes(1);
    expect(mocks.validateInstanceSettings).toHaveBeenCalledWith(
      { instance_name: "abc" },
      expect.anything(),
    );
  });

  it("keeps different keys on independent timers", async () => {
    const { result } = renderHook(() => useSettingValidation());

    act(() => {
      result.current.validateKey("instance_name", "x");
      result.current.validateKey("contact_email", "y");
    });
    await settleDebounce();

    expect(mocks.validateInstanceSettings).toHaveBeenCalledTimes(2);
    expect(mocks.validateInstanceSettings).toHaveBeenCalledWith(
      { instance_name: "x" },
      expect.anything(),
    );
    expect(mocks.validateInstanceSettings).toHaveBeenCalledWith(
      { contact_email: "y" },
      expect.anything(),
    );
  });

  it("surfaces only the issue matching the key it asked about", async () => {
    mocks.validateInstanceSettings.mockResolvedValue({
      fields: [
        { field: "someone_else", message: "not this row's problem" },
        { field: "instance_name", message: "is required" },
      ],
    });
    const { result } = renderHook(() => useSettingValidation());

    act(() => result.current.validateKey("instance_name", ""));
    await settleDebounce();

    expect(result.current.errors.instance_name).toBe("is required");
    expect(result.current.errors.someone_else).toBeUndefined();
  });

  it("clears a key's message when the server says the value is fine", async () => {
    mocks.validateInstanceSettings.mockResolvedValue({
      fields: [{ field: "instance_name", message: "is required" }],
    });
    const { result } = renderHook(() => useSettingValidation());
    act(() => result.current.validateKey("instance_name", ""));
    await settleDebounce();
    expect(result.current.errors.instance_name).toBe("is required");

    mocks.validateInstanceSettings.mockResolvedValue({ fields: [] });
    act(() => result.current.validateKey("instance_name", "Vidra"));
    await settleDebounce();

    expect(result.current.errors.instance_name).toBeUndefined();
  });

  it("discards a stale answer so the last edit wins", async () => {
    // The first probe resolves LATE and rejects the value; the second resolves
    // clean. Without ticketing, the late "is required" would land on top of the
    // good value the operator has already typed.
    let releaseFirst: (v: {
      fields: { field: string; message: string }[];
    }) => void = () => {};
    mocks.validateInstanceSettings
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ fields: [] });

    const { result } = renderHook(() => useSettingValidation());
    act(() => result.current.validateKey("instance_name", ""));
    await settleDebounce();

    act(() => result.current.validateKey("instance_name", "Vidra"));
    await settleDebounce();

    await act(async () => {
      releaseFirst({
        fields: [{ field: "instance_name", message: "is required" }],
      });
      await Promise.resolve();
    });

    expect(result.current.errors.instance_name).toBeUndefined();
  });

  it("clearKey drops a message and cancels the pending probe", async () => {
    mocks.validateInstanceSettings.mockResolvedValue({
      fields: [{ field: "instance_name", message: "is required" }],
    });
    const { result } = renderHook(() => useSettingValidation());
    act(() => result.current.validateKey("instance_name", ""));
    await settleDebounce();
    expect(result.current.errors.instance_name).toBe("is required");

    act(() => {
      result.current.validateKey("instance_name", "");
      result.current.clearKey("instance_name");
    });
    await settleDebounce();

    expect(result.current.errors.instance_name).toBeUndefined();
    // Only the first probe ever went out; clearKey cancelled the queued one.
    expect(mocks.validateInstanceSettings).toHaveBeenCalledTimes(1);
  });

  it("a failed probe reports nothing — the save-time 422 is the backstop", async () => {
    mocks.validateInstanceSettings.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useSettingValidation());

    act(() => result.current.validateKey("instance_name", ""));
    await settleDebounce();

    expect(result.current.errors).toEqual({});
  });

  it("reset drops every message", async () => {
    mocks.validateInstanceSettings.mockResolvedValue({
      fields: [{ field: "instance_name", message: "is required" }],
    });
    const { result } = renderHook(() => useSettingValidation());
    act(() => result.current.validateKey("instance_name", ""));
    await settleDebounce();
    expect(result.current.errors.instance_name).toBe("is required");

    act(() => result.current.reset());
    expect(result.current.errors).toEqual({});
  });
});
