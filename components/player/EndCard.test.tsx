// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EndCard } from "./EndCard";
import type { Video } from "@/lib/api";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const NEXT = {
  id: "v2",
  title: "The next video",
  channel_display_name: "Grade House",
  has_thumbnail: false,
} as unknown as Video;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockClear();
  setHidden(false);
});

beforeEach(() => {
  push.mockClear();
});

describe("EndCard", () => {
  it("counts down and navigates to the next video when it reaches zero", () => {
    vi.useFakeTimers();
    try {
      render(
        <EndCard
          nextVideo={NEXT}
          autoplayEnabled
          onToggleAutoplay={() => {}}
          onReplay={() => {}}
          onDismiss={() => {}}
        />,
      );
      // The next video + a polite countdown announcement render.
      expect(screen.getByText("The next video")).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe("Playing next in 8 seconds");
      // Focus lands on Play now for keyboard/AT users.
      expect(screen.getByRole("button", { name: "Play now" })).toBe(document.activeElement);

      act(() => void vi.advanceTimersByTime(8000));
      expect(push).toHaveBeenCalledWith("/videos/v2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Play now navigates immediately without waiting for the countdown", () => {
    render(
      <EndCard
        nextVideo={NEXT}
        autoplayEnabled
        onToggleAutoplay={() => {}}
        onReplay={() => {}}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play now" }));
    expect(push).toHaveBeenCalledWith("/videos/v2");
  });

  it("Cancel halts the countdown and keeps the card (no navigation) with a Replay affordance", () => {
    vi.useFakeTimers();
    try {
      render(
        <EndCard
          nextVideo={NEXT}
          autoplayEnabled
          onToggleAutoplay={() => {}}
          onReplay={() => {}}
          onDismiss={() => {}}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      // Countdown is gone; the card stays with Replay + Play now still available.
      expect(screen.getByRole("status").textContent).toBe("");
      expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
      act(() => void vi.advanceTimersByTime(20000));
      expect(push).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("suppresses the countdown when autoplay is off, but still lets Play now navigate", () => {
    vi.useFakeTimers();
    try {
      render(
        <EndCard
          nextVideo={NEXT}
          autoplayEnabled={false}
          onToggleAutoplay={() => {}}
          onReplay={() => {}}
          onDismiss={() => {}}
        />,
      );
      // No countdown announcement, no auto-navigation.
      expect(screen.getByRole("status").textContent).toBe("");
      expect(screen.getByRole("switch", { name: "Autoplay next" }).getAttribute("aria-checked")).toBe(
        "false",
      );
      act(() => void vi.advanceTimersByTime(20000));
      expect(push).not.toHaveBeenCalled();
      // But the explicit action still works.
      fireEvent.click(screen.getByRole("button", { name: "Play now" }));
      expect(push).toHaveBeenCalledWith("/videos/v2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses the countdown while the tab is hidden and never navigates a backgrounded tab", () => {
    vi.useFakeTimers();
    try {
      setHidden(true);
      render(
        <EndCard
          nextVideo={NEXT}
          autoplayEnabled
          onToggleAutoplay={() => {}}
          onReplay={() => {}}
          onDismiss={() => {}}
        />,
      );
      act(() => void vi.advanceTimersByTime(20000));
      // Hidden → the tick is skipped, the countdown holds, and nothing navigates.
      expect(screen.getByRole("status").textContent).toBe("Playing next in 8 seconds");
      expect(push).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("toggles the autoplay switch and reflects the effective preference", () => {
    const onToggleAutoplay = vi.fn();
    render(
      <EndCard
        nextVideo={NEXT}
        autoplayEnabled
        onToggleAutoplay={onToggleAutoplay}
        onReplay={() => {}}
        onDismiss={() => {}}
      />,
    );
    const sw = screen.getByRole("switch", { name: "Autoplay next" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(onToggleAutoplay).toHaveBeenCalledTimes(1);
  });

  it("Escape cancels a running countdown, then dismisses the card", () => {
    const onDismiss = vi.fn();
    render(
      <EndCard
        nextVideo={NEXT}
        autoplayEnabled
        onToggleAutoplay={() => {}}
        onReplay={() => {}}
        onDismiss={onDismiss}
      />,
    );
    const card = screen.getByTestId("player-end-card");
    // First Escape cancels (card stays, no dismiss yet).
    fireEvent.keyDown(card, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
    // Second Escape dismisses.
    fireEvent.keyDown(card, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows only a Replay affordance (no countdown) when there is no next video", () => {
    vi.useFakeTimers();
    try {
      const onReplay = vi.fn();
      render(
        <EndCard
          nextVideo={null}
          autoplayEnabled
          onToggleAutoplay={() => {}}
          onReplay={onReplay}
          onDismiss={() => {}}
        />,
      );
      expect(screen.queryByRole("button", { name: "Play now" })).toBeNull();
      expect(screen.queryByRole("switch", { name: "Autoplay next" })).toBeNull();
      const replay = screen.getByRole("button", { name: "Replay" });
      expect(replay).toBe(document.activeElement);
      act(() => void vi.advanceTimersByTime(20000));
      expect(push).not.toHaveBeenCalled();
      fireEvent.click(replay);
      expect(onReplay).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

it("retains playlist context when advancing", () => {
  render(<EndCard nextVideo={NEXT} nextHref="/videos/v2?playlist=p1" autoplayEnabled={false}
    onToggleAutoplay={() => {}} onReplay={() => {}} onDismiss={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Play now" }));
  expect(push).toHaveBeenCalledWith("/videos/v2?playlist=p1");
});
