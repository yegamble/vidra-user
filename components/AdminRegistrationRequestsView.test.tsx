// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRegistrationRequests: vi.fn(),
  approveRegistrationRequest: vi.fn(),
  rejectRegistrationRequest: vi.fn(),
}));

// A store-backed next/navigation stub: setFilter writes the URL and really
// re-renders, so a filter switch drives an actual refetch (the readback below).
vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/components/RoleGate", () => ({
  RoleGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: { id: "admin-1", username: "e2eadmin", role: "admin" } }),
}));
vi.mock("@/lib/api", () => ({
  api: {
    getRegistrationRequests: mocks.getRegistrationRequests,
    approveRegistrationRequest: mocks.approveRegistrationRequest,
    rejectRegistrationRequest: mocks.rejectRegistrationRequest,
  },
  // The component narrows on `err instanceof ApiError && err.status === 409`; a
  // minimal stand-in is enough for the happy-path assertions here.
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message?: string) {
      super(message);
      this.status = status;
    }
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { AdminRegistrationRequestsView } from "@/components/AdminRegistrationRequestsView";
import { navigation } from "@/lib/test-navigation";

const EMAIL = "hopeful@example.test";

function pending(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    username: "hopeful",
    email: EMAIL,
    note: "please let me in",
    status: "pending" as const,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

/** One page of registration requests in the server's envelope. */
function page(requests: Record<string, unknown>[], total = requests.length) {
  return { requests, total, limit: 20, offset: 0 };
}

/** The status badge span renders the lowercase enum; the "Approved"/"Rejected"
 * filter chips and the "Approved by …" line are capitalised, so an exact
 * lowercase match hits only the row's own status badge. */
const badge = (status: "pending" | "approved" | "rejected") =>
  screen.queryByText(status, { exact: true });

beforeEach(() => {
  navigation.reset("/admin/registration-requests");
  mocks.getRegistrationRequests.mockReset();
  mocks.approveRegistrationRequest.mockReset();
  mocks.rejectRegistrationRequest.mockReset();
  mocks.approveRegistrationRequest.mockResolvedValue(undefined);
  mocks.rejectRegistrationRequest.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("AdminRegistrationRequestsView in-place resolution", () => {
  // The Wave A regression: on the default "Pending" queue an approve/reject made
  // the row vanish, so the admin saw the work disappear rather than take effect.
  it("keeps an approved request visible in place instead of dropping it from the Pending queue", async () => {
    mocks.getRegistrationRequests.mockResolvedValue(page([pending()]));
    render(<AdminRegistrationRequestsView />);

    await screen.findByText(EMAIL);
    expect(badge("pending")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Approve hopeful" }));

    await waitFor(() =>
      expect(mocks.approveRegistrationRequest).toHaveBeenCalledWith("req-1"),
    );

    // The row is STILL on screen — not dropped — and now shows its new status
    // and the acting reviewer, which is the confirmation the admin needs.
    await waitFor(() => expect(badge("approved")).not.toBeNull());
    expect(screen.getByText(EMAIL)).toBeTruthy();
    // The resolved row states the outcome and names the acting reviewer.
    expect(
      screen.getByText(
        (_content, el) => el?.tagName === "P" && /^Approved by/.test(el.textContent ?? ""),
      ),
    ).toBeTruthy();
    expect(screen.getByText("e2eadmin")).toBeTruthy();
    // The resolved row offers no further action.
    expect(screen.queryByRole("button", { name: "Approve hopeful" })).toBeNull();
    // It never refetched to make the change visible — the row was updated in place.
    expect(mocks.getRegistrationRequests).toHaveBeenCalledTimes(1);
  });

  it("keeps a rejected request visible in place with its recorded note", async () => {
    mocks.getRegistrationRequests.mockResolvedValue(page([pending()]));
    render(<AdminRegistrationRequestsView />);

    await screen.findByText(EMAIL);
    fireEvent.change(screen.getByLabelText("Internal note for hopeful"), {
      target: { value: "spam signup" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject hopeful" }));

    await waitFor(() =>
      expect(mocks.rejectRegistrationRequest).toHaveBeenCalledWith("req-1", { note: "spam signup" }),
    );

    await waitFor(() => expect(badge("rejected")).not.toBeNull());
    expect(screen.getByText(EMAIL)).toBeTruthy();
    // The internal note is echoed back on the resolved row.
    expect(screen.getByText(/spam signup/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reject hopeful" })).toBeNull();
  });

  // Not just an optimistic paint: a fresh fetch from the server (here a filter
  // switch, which re-reads the queue) must also report the persisted status.
  it("reflects the persisted status on a fresh reload, not only optimistically", async () => {
    mocks.getRegistrationRequests
      .mockResolvedValueOnce(page([pending()]))
      .mockResolvedValueOnce(
        page([
          pending({
            status: "approved",
            reviewer_username: "e2eadmin",
            reviewed_at: "2026-09-02T00:00:00Z",
          }),
        ]),
      );
    render(<AdminRegistrationRequestsView />);

    await screen.findByText(EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Approve hopeful" }));
    await waitFor(() => expect(badge("approved")).not.toBeNull());

    // Switch to "All" — a real refetch whose server response is the source of the
    // status now shown, proving the approval survived a reload.
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(mocks.getRegistrationRequests).toHaveBeenCalledTimes(2));

    await screen.findByText(EMAIL);
    expect(badge("approved")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Approve hopeful" })).toBeNull();
  });
});
