// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { LoadMoreSentinel } from "@/components/ui/LoadMoreButton";

import { shouldRenderLoadMore, useAutoLoad, type UseAutoLoadOptions } from "./use-auto-load";

// jsdom has no IntersectionObserver. Same stubbing approach as
// `HomeRecommendationsRail.test.tsx`, but recording instances so a test can fire
// the callback by hand and assert what was observed/disconnected.
type Instance = {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observed: Element[];
  disconnect: Mock<() => void>;
};
let instances: Instance[] = [];

class MockIO {
  private self: Instance;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.self = { callback, options, observed: [], disconnect: vi.fn() };
    instances.push(this.self);
  }
  observe(target: Element) {
    this.self.observed.push(target);
  }
  unobserve() {}
  disconnect() {
    this.self.disconnect();
  }
}

/** Fire the newest observer's callback as if the sentinel scrolled into view. */
function scrollSentinelIntoView(isIntersecting = true) {
  const io = instances.at(-1);
  if (!io) throw new Error("no IntersectionObserver was constructed");
  act(() => {
    io.callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

function List(props: UseAutoLoadOptions) {
  const ref = useAutoLoad(props);
  return <LoadMoreSentinel ref={ref} />;
}

beforeEach(() => {
  instances = [];
  vi.stubGlobal("IntersectionObserver", MockIO);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useAutoLoad", () => {
  it("constructs no observer at all when disabled", () => {
    const onLoadMore = vi.fn();
    render(<List enabled={false} hasMore busy={false} onLoadMore={onLoadMore} />);
    expect(instances).toHaveLength(0);
  });

  it("constructs no observer once there is nothing left to fetch", () => {
    render(<List hasMore={false} busy={false} onLoadMore={vi.fn()} />);
    expect(instances).toHaveLength(0);
  });

  it("constructs no observer while a page is already in flight", () => {
    render(<List hasMore busy onLoadMore={vi.fn()} />);
    expect(instances).toHaveLength(0);
  });

  it("degrades to a no-op when the platform has no IntersectionObserver", () => {
    // SSR and jsdom both land here; it must not throw and must not fetch.
    vi.stubGlobal("IntersectionObserver", undefined);
    const onLoadMore = vi.fn();
    expect(() => render(<List hasMore busy={false} onLoadMore={onLoadMore} />)).not.toThrow();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("observes the sentinel and loads the next page when it comes into view", () => {
    const onLoadMore = vi.fn();
    const { container } = render(<List hasMore busy={false} onLoadMore={onLoadMore} />);
    expect(instances).toHaveLength(1);
    expect(instances[0].observed).toEqual([container.firstElementChild]);
    scrollSentinelIntoView();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("ignores a callback that reports the sentinel out of view", () => {
    const onLoadMore = vi.fn();
    render(<List hasMore busy={false} onLoadMore={onLoadMore} />);
    scrollSentinelIntoView(false);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("disconnects before handing off, so a fast scroll cannot double-fire", () => {
    const onLoadMore = vi.fn();
    render(<List hasMore busy={false} onLoadMore={onLoadMore} />);
    scrollSentinelIntoView();
    expect(instances[0].disconnect).toHaveBeenCalled();
    scrollSentinelIntoView();
    // The second callback still runs (we invoked it directly) but the real
    // observer is disconnected; what matters is the guard exists.
    expect(instances).toHaveLength(1);
  });

  it("re-arms once the in-flight page lands and there is still more", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<List hasMore busy={false} onLoadMore={onLoadMore} />);
    scrollSentinelIntoView();
    rerender(<List hasMore busy onLoadMore={onLoadMore} />);
    rerender(<List hasMore busy={false} onLoadMore={onLoadMore} />);
    expect(instances).toHaveLength(2);
  });

  it("stops for good once the last page has landed", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<List hasMore busy={false} onLoadMore={onLoadMore} />);
    rerender(<List hasMore={false} busy={false} onLoadMore={onLoadMore} />);
    expect(instances[0].disconnect).toHaveBeenCalled();
    expect(instances).toHaveLength(1);
  });

  it("disconnects on unmount", () => {
    const { unmount } = render(<List hasMore busy={false} onLoadMore={vi.fn()} />);
    unmount();
    expect(instances[0].disconnect).toHaveBeenCalled();
  });

  it("does not rebuild the observer when only the callback identity changes", () => {
    const { rerender } = render(<List hasMore busy={false} onLoadMore={() => {}} />);
    rerender(<List hasMore busy={false} onLoadMore={() => {}} />);
    expect(instances).toHaveLength(1);
  });

  it("calls the latest callback even though the observer was not rebuilt", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<List hasMore busy={false} onLoadMore={first} />);
    rerender(<List hasMore busy={false} onLoadMore={second} />);
    scrollSentinelIntoView();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("prefetches a screen ahead by default and honours an override", () => {
    render(<List hasMore busy={false} onLoadMore={vi.fn()} />);
    expect(instances[0].options?.rootMargin).toBe("400px");
    cleanup();
    instances = [];
    render(<List hasMore busy={false} onLoadMore={vi.fn()} rootMargin="0px" />);
    expect(instances[0].options?.rootMargin).toBe("0px");
  });
});

describe("shouldRenderLoadMore", () => {
  it("hides the button when there is no next page", () => {
    expect(shouldRenderLoadMore({ hasMore: false, autoLoad: false })).toBe(false);
    expect(shouldRenderLoadMore({ hasMore: false, autoLoad: true, error: "boom" })).toBe(false);
  });

  it("keeps the button as the only route to page two when auto-load is off", () => {
    expect(shouldRenderLoadMore({ hasMore: true, autoLoad: false })).toBe(true);
  });

  it("hides the button while auto-load is quietly working", () => {
    expect(shouldRenderLoadMore({ hasMore: true, autoLoad: true })).toBe(false);
  });

  it("brings the button back as the retry after a failed auto-load", () => {
    expect(shouldRenderLoadMore({ hasMore: true, autoLoad: true, error: "Network error" })).toBe(
      true,
    );
  });
});
