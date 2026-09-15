// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

function Probe() {
  return <span data-testid="v">{String(usePrefersReducedMotion())}</span>;
}

// jsdom has no matchMedia at all, so every test installs one whose `matches`
// can be flipped and whose change listeners can be fired — that flip is the
// whole point of the hook.
let listeners: Array<(e: MediaQueryListEvent) => void>;
let matches: boolean;

function install({ legacy = false }: { legacy?: boolean } = {}) {
  listeners = [];
  window.matchMedia = ((query: string) => {
    const mql = {
      get matches() {
        return matches && query.includes("prefers-reduced-motion");
      },
      media: query,
      onchange: null,
      addListener: (fn: (e: MediaQueryListEvent) => void) => listeners.push(fn),
      removeListener: (fn: (e: MediaQueryListEvent) => void) => {
        listeners = listeners.filter((l) => l !== fn);
      },
      dispatchEvent: () => false,
    } as unknown as Record<string, unknown>;
    if (!legacy) {
      mql.addEventListener = (_t: string, fn: (e: MediaQueryListEvent) => void) => {
        listeners.push(fn);
      };
      mql.removeEventListener = (_t: string, fn: (e: MediaQueryListEvent) => void) => {
        listeners = listeners.filter((l) => l !== fn);
      };
    }
    return mql as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;
}

function flip(to: boolean) {
  matches = to;
  act(() => {
    listeners.forEach((l) => l({ matches: to } as MediaQueryListEvent));
  });
}

beforeEach(() => {
  matches = false;
  install();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("usePrefersReducedMotion", () => {
  it("reports the current preference", () => {
    matches = true;
    render(<Probe />);
    expect(screen.getByTestId("v").textContent).toBe("true");
  });

  it("re-renders when the preference changes mid-session, in both directions", () => {
    render(<Probe />);
    expect(screen.getByTestId("v").textContent).toBe("false");
    flip(true);
    expect(screen.getByTestId("v").textContent).toBe("true");
    flip(false);
    expect(screen.getByTestId("v").textContent).toBe("false");
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = render(<Probe />);
    expect(listeners.length).toBe(1);
    unmount();
    expect(listeners.length).toBe(0);
  });

  it("falls back to addListener where addEventListener is absent (older Safari)", () => {
    install({ legacy: true });
    render(<Probe />);
    expect(listeners.length).toBe(1);
    flip(true);
    expect(screen.getByTestId("v").textContent).toBe("true");
  });

  it("reports false where matchMedia does not exist at all", () => {
    // @ts-expect-error — deleting the global is the condition under test.
    delete window.matchMedia;
    render(<Probe />);
    expect(screen.getByTestId("v").textContent).toBe("false");
  });
});
