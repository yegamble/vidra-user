// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getInstanceCached: vi.fn(), invalidateInstanceCache: vi.fn() }));
vi.mock("@/lib/api", () => mocks);
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import type { InstanceResponse } from "@/lib/api";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";
import { primeInstanceFeatures, refreshInstanceFeatures, setInstanceFeaturesForTests } from "@/lib/instance-features";
import { InstanceBanner } from "./InstanceBanner";

beforeEach(() => {
  localStorage.clear();
  setInstanceFeaturesForTests(null);
  mocks.getInstanceCached.mockReset();
  mocks.invalidateInstanceCache.mockReset();
});
afterEach(() => { cleanup(); setInstanceFeaturesForTests(null); });

it("updates an SSR announcement after an admin refresh and removes it when disabled", async () => {
  const broadcast: InstanceResponse["broadcast"] = {
    enabled: true, message: "Original announcement", level: "info", dismissable: false,
  };
  const initial = { features: {}, broadcast };
  mocks.getInstanceCached.mockResolvedValueOnce(initial);
  primeInstanceFeatures(); // Other capability consumers already load this document.
  render(<InstanceBanner instance={{ broadcast } as InstanceConfigSnapshot} />);
  await screen.findByText("Original announcement");
  expect(mocks.getInstanceCached).toHaveBeenCalledTimes(1);

  let finish!: (instance: typeof initial) => void;
  mocks.getInstanceCached.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  act(() => refreshInstanceFeatures());
  expect(screen.getByText("Original announcement")).toBeTruthy();
  await act(async () => { finish({ features: {}, broadcast: { ...broadcast, message: "Updated announcement", level: "warning" } }); });
  await screen.findByText("Updated announcement");
  expect(screen.getByRole("region", { name: "Announcement" }).getAttribute("data-level")).toBe("warning");

  mocks.getInstanceCached.mockResolvedValueOnce({ features: {}, broadcast: { ...broadcast, enabled: false } });
  act(() => refreshInstanceFeatures());
  await waitFor(() => expect(screen.queryByRole("region", { name: "Announcement" })).toBeNull());
  expect(mocks.getInstanceCached).toHaveBeenCalledTimes(3);
  expect(mocks.invalidateInstanceCache).toHaveBeenCalledTimes(2);
});
