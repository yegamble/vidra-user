// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./Toast";

afterEach(cleanup);

// A tiny harness: a button that fires a toast when clicked, so the toast is
// created inside a React event (auto-wrapped in act by RTL).
function Harness({ message, variant }: { message: string; variant?: "info" | "success" | "error" }) {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast({ message, variant })}>
      fire
    </button>
  );
}

describe("useToast", () => {
  it("throws when used outside a ToastProvider", () => {
    // Silence the expected React error boundary console noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Harness message="x" />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe("ToastProvider", () => {
  it("announces an info toast politely via role=status", () => {
    render(
      <ToastProvider>
        <Harness message="Saved" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "fire" }));
    const toast = screen.getByRole("status");
    expect(toast.textContent).toContain("Saved");
    expect(toast.getAttribute("aria-live")).toBe("polite");
  });

  it("announces an error toast assertively via role=alert", () => {
    render(
      <ToastProvider>
        <Harness message="Failed" variant="error" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "fire" }));
    const toast = screen.getByRole("alert");
    expect(toast.textContent).toContain("Failed");
    expect(toast.getAttribute("aria-live")).toBe("assertive");
  });

  it("dismisses a toast via its close button", () => {
    render(
      <ToastProvider>
        <Harness message="Saved" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "fire" }));
    expect(screen.queryByRole("status")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("auto-dismisses after the default duration", () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <Harness message="Saved" />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "fire" }));
      expect(screen.queryByRole("status")).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
