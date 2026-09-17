// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { MouseEvent, PointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerSeeking } from "./use-player-seeking";

function setup(controlsVisible = true) {
  const video = document.createElement("video");
  video.currentTime = 50;
  Object.defineProperty(video, "duration", { value: 120 });
  video.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 } as DOMRect);
  const onTogglePlay = vi.fn(), onShowControls = vi.fn(), onSeek = vi.fn();
  const { result, rerender, unmount } = renderHook(({ visible }) => usePlayerSeeking({
    videoRef: { current: video }, controlsVisible: visible, onTogglePlay, onShowControls, onSeek,
  }), { initialProps: { visible: controlsVisible } });
  function pointer(kind: "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel", x = 900,
    extra: Partial<PointerEvent<HTMLVideoElement>> = {}) {
    const event = { target: video, currentTarget: video, pointerType: "touch", pointerId: 1,
      isPrimary: true, button: 0, clientX: x, clientY: 100, ...extra } as PointerEvent<HTMLVideoElement>;
    act(() => result.current.surfaceHandlers[kind]?.(event));
  }
  function tap(x = 900) { pointer("onPointerDown", x); pointer("onPointerUp", x); }
  function click(extra: Partial<MouseEvent<HTMLVideoElement>> = {}) {
    act(() => result.current.surfaceHandlers.onClick?.({ target: video, currentTarget: video,
      detail: 1, button: 0, nativeEvent: {}, ...extra } as MouseEvent<HTMLVideoElement>));
  }
  return { video, result, rerender, unmount, pointer, tap, click, onTogglePlay, onShowControls, onSeek };
}
function advance(ms: number) { act(() => vi.advanceTimersByTime(ms)); }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("player seeking", () => {
  it("keeps jumps fixed while accumulating feedback, resetting on direction and timeout", () => {
    const { result, video } = setup();
    act(() => { result.current.seekBy(5); result.current.seekBy(5); result.current.seekBy(5); });
    expect(video.currentTime).toBe(65);
    expect(result.current.feedback).toEqual({ direction: 1, seconds: 15 });
    act(() => result.current.seekBy(-5));
    expect(result.current.feedback).toEqual({ direction: -1, seconds: 5 });
    advance(751);
    expect(result.current.feedback).toBeNull();
    act(() => result.current.seekBy(-5));
    expect(result.current.feedback).toEqual({ direction: -1, seconds: 5 });
  });

  it("clamps to media boundaries and reports only the seconds actually moved", () => {
    const { result, video, onSeek } = setup();
    video.currentTime = 118;
    act(() => result.current.seekBy(5));
    expect(video.currentTime).toBe(120);
    expect(result.current.feedback).toEqual({ direction: 1, seconds: 2 });
    expect(onSeek).toHaveBeenLastCalledWith(120);
    act(() => result.current.seekBy(-200));
    expect(video.currentTime).toBe(0);
    expect(result.current.feedback).toEqual({ direction: -1, seconds: 120 });
    act(() => { result.current.seekBy(Number.NaN); result.current.seekBy(Infinity); result.current.seekBy(0); });
    expect(video.currentTime).toBe(0);
  });

  it("uses side double taps then rapid extra taps; the first tap only reveals controls", () => {
    const { tap, click, video, result, onTogglePlay, onShowControls } = setup();
    tap(); click();
    expect(video.currentTime).toBe(50);
    expect(onTogglePlay).not.toHaveBeenCalled();
    expect(onShowControls).toHaveBeenCalledOnce();
    advance(100); tap();
    expect(video.currentTime).toBe(60);
    advance(400); tap();
    expect(video.currentTime).toBe(70);
    expect(result.current.feedback).toEqual({ direction: 1, seconds: 20 });
    expect(onTogglePlay).not.toHaveBeenCalled();
    advance(751); tap();
    expect(video.currentTime).toBe(70);
  });

  it("requires another double tap after a changed direction or an expired first tap", () => {
    const { tap, video, result } = setup();
    tap(); advance(301); tap();
    expect(video.currentTime).toBe(50);
    advance(50); tap(100);
    expect(video.currentTime).toBe(50);
    advance(50); tap(100);
    expect(video.currentTime).toBe(40);
    expect(result.current.feedback).toEqual({ direction: -1, seconds: 10 });
  });

  it("toggles visible center taps once and reveals hidden controls using the pointer-down snapshot", () => {
    const { pointer, click, rerender, onTogglePlay, onShowControls } = setup(false);
    pointer("onPointerDown", 500);
    rerender({ visible: true }); // the stage's bubbling pointerdown reveals its chrome
    pointer("onPointerUp", 500); click();
    expect(onTogglePlay).not.toHaveBeenCalled();
    expect(onShowControls).toHaveBeenCalledOnce();
    pointer("onPointerDown", 500); pointer("onPointerUp", 500); click();
    expect(onTogglePlay).toHaveBeenCalledOnce();
  });

  it.each(["movement", "cancel", "hold"])("cancels %s rather than treating it as a tap", (reason) => {
    const { tap, pointer, video, onTogglePlay } = setup();
    tap(); advance(50);
    pointer("onPointerDown");
    if (reason === "movement") pointer("onPointerMove", 920);
    if (reason === "cancel") pointer("onPointerCancel");
    if (reason === "hold") advance(501);
    pointer("onPointerUp");
    expect(video.currentTime).toBe(50);
    tap();
    expect(video.currentTime).toBe(50);
    expect(onTogglePlay).not.toHaveBeenCalled();
  });

  it("cancels a multi-touch gesture and requires a new double tap afterward", () => {
    const { tap, pointer, video } = setup();
    tap();
    pointer("onPointerDown");
    pointer("onPointerDown", 100, { pointerId: 2, isPrimary: false });
    pointer("onPointerUp");
    pointer("onPointerUp", 100, { pointerId: 2, isPrimary: false });
    tap();
    expect(video.currentTime).toBe(50);
    tap();
    expect(video.currentTime).toBe(60);
  });

  it("cancels when a second finger lands elsewhere, without blocking its native gesture", () => {
    const { tap, pointer, video } = setup();
    tap(); pointer("onPointerDown");
    const second = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(second, { pointerType: "touch", pointerId: 2, isPrimary: false });
    act(() => document.dispatchEvent(second));
    pointer("onPointerUp");
    expect(second.defaultPrevented).toBe(false);
    expect(video.currentTime).toBe(50);
    tap();
    expect(video.currentTime).toBe(50);
    tap();
    expect(video.currentTime).toBe(60);
  });

  it("requires nearby taps and a stable zone instead of interpreting a cross-video gesture", () => {
    const { tap, pointer, video } = setup();
    tap(700); tap(900);
    expect(video.currentTime).toBe(50);
    pointer("onPointerDown", 648); pointer("onPointerUp", 652);
    tap(900);
    expect(video.currentTime).toBe(50);
  });

  it("ignores controls and native video controls while preserving real mouse and keyboard clicks", () => {
    const { tap, pointer, click, video, onTogglePlay } = setup();
    const input = document.createElement("input");
    click({ target: input });
    pointer("onPointerDown", 900, { target: input });
    pointer("onPointerUp", 900, { target: input });
    expect(onTogglePlay).not.toHaveBeenCalled();
    video.controls = true; tap(); tap(); click();
    expect(video.currentTime).toBe(50);
    expect(onTogglePlay).not.toHaveBeenCalled();
    video.controls = false; tap();
    pointer("onPointerDown", 500, { pointerType: "mouse" }); click();
    click({ detail: 0 });
    expect(onTogglePlay).toHaveBeenCalledTimes(2);
  });

  it("clears pending gestures and feedback explicitly, and disposes timers on unmount", () => {
    const { result, tap, video, unmount } = setup();
    tap();
    act(() => { result.current.seekBy(5); result.current.resetFeedback(); });
    expect(result.current.feedback).toBeNull();
    tap();
    expect(video.currentTime).toBe(55);
    act(() => result.current.seekBy(5));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
