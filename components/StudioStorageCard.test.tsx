// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The card is fetch-driven; mock the one endpoint it calls.
vi.mock("@/lib/api", () => ({
  api: { getMyQuota: vi.fn() },
}));

import { api } from "@/lib/api";

import { StudioStorageCard } from "./StudioStorageCard";

const mockQuota = vi.mocked(api.getMyQuota);

const GB = 1024 * 1024 * 1024;

afterEach(() => {
  cleanup();
  mockQuota.mockReset();
});

describe("StudioStorageCard", () => {
  it("renders used-of-quota with a clamped progress bar", async () => {
    // 5 GiB of 20 GiB → 25%.
    mockQuota.mockResolvedValue({ used_bytes: 5 * GB, quota_bytes: 20 * GB });
    render(<StudioStorageCard />);

    await waitFor(() => expect(screen.getByText("5.0 GB of 20.0 GB")).toBeTruthy());
    const bar = screen.getByRole("progressbar", { name: "Storage used" });
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
  });

  it("caps the bar at 100% when usage exceeds the quota", async () => {
    mockQuota.mockResolvedValue({ used_bytes: 30 * GB, quota_bytes: 20 * GB });
    render(<StudioStorageCard />);

    const bar = await screen.findByRole("progressbar", { name: "Storage used" });
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
  });

  it("shows an unlimited state without a progress bar", async () => {
    mockQuota.mockResolvedValue({ used_bytes: 3 * GB, quota_bytes: null });
    render(<StudioStorageCard />);

    await waitFor(() => expect(screen.getByText("3.0 GB used")).toBeTruthy());
    expect(screen.getByText("Unlimited on this instance.")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders nothing when the quota lookup fails", async () => {
    mockQuota.mockRejectedValue(new Error("boom"));
    const { container } = render(<StudioStorageCard />);

    await waitFor(() => expect(mockQuota).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});
