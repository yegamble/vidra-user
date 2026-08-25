// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ListTail } from "./ListTail";

// jsdom has no IntersectionObserver; record instances so a test can fire a
// sentinel intersection by hand (same approach as lib/use-auto-load.test.tsx).
type Instance = { callback: IntersectionObserverCallback; disconnect: Mock<() => void> };
let observers: Instance[] = [];

class MockIO {
  private self: Instance;
  constructor(callback: IntersectionObserverCallback) {
    this.self = { callback, disconnect: vi.fn() };
    observers.push(this.self);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.self.disconnect();
  }
}

function scrollSentinelIntoView() {
  const io = observers.at(-1);
  if (!io) throw new Error("no IntersectionObserver was constructed");
  act(() => {
    io.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", MockIO);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ListTail", () => {
  it("renders nothing at the end of the list", () => {
    const { container } = render(
      <ListTail hasMore={false} autoLoad={false} busy={false} onLoadMore={vi.fn()} />,
    );
    expect(container.textContent).toBe("");
    expect(screen.queryByTestId("load-more-sentinel")).toBeNull();
  });

  it("observes nothing in button mode, and keeps the button", () => {
    render(<ListTail hasMore autoLoad={false} busy={false} onLoadMore={vi.fn()} />);

    expect(observers).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
  });

  it("fetches from the sentinel in auto mode and stands the button down", () => {
    const onLoadMore = vi.fn();
    render(<ListTail hasMore autoLoad busy={false} onLoadMore={onLoadMore} />);

    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    scrollSentinelIntoView();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("brings the button back the moment an automatic page fails", () => {
    render(
      <ListTail hasMore autoLoad busy={false} error="Could not load more." onLoadMore={vi.fn()} />,
    );

    // The keyboard-unreachable sentinel has given up; the click is the retry,
    // and a sentinel retrying itself would loop.
    expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Could not load more.");
  });

  it("never observes while a page is already in flight", () => {
    render(<ListTail hasMore autoLoad busy onLoadMore={vi.fn()} />);
    expect(observers).toHaveLength(0);
  });
});
