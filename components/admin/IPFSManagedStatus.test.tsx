// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, type IPFSConfigDocument, type IPFSStatus } from "@/lib/api";
import { IPFSManagedStatus } from "./IPFSManagedStatus";

const document: IPFSConfigDocument = { revision: 3, policy_active: true, config: {
  provider: "internal", enabled: false, auto_pin_new: true, demand_pin: false, backfill_enabled: false,
  budget_bytes: 20 * 1024 ** 3, min_free_bytes: 20 * 1024 ** 3, copy_bytes_per_second: 2 * 1024 ** 2, workers: 1,
} };
const pins = { pinned: 0, pending: 0, failed: 0, unpinned: 0 };
const network = { enabled: false, node_reachable: false, cluster_enabled: false, cluster_reachable: false, pins, by_class: [] };
const status: IPFSStatus = { ...network, gateway_url: "", networks: { public: network, private: network },
  config_revision: 3,
  management: { mode: "internal", available: true, desired_state: "running", observed_state: "stopped",
    applied_config_revision: 2, operation: null, last_error_code: null, observed_at: "2026-09-17T08:00:00Z" },
  capacity: { budget_bytes: 20 * 1024 ** 3, min_free_bytes: 20 * 1024 ** 3, repo_used_bytes: null,
    filesystem_free_bytes: null, reserved_bytes: 0, admission_paused_reason: "stale_capacity" },
};
beforeEach(() => {
  vi.spyOn(api, "getIPFSStatus").mockResolvedValue(status);
  vi.spyOn(api, "runIPFSOperation").mockResolvedValue({ revision: 3, operation: {
    id: "22222222-2222-4222-8222-222222222222", sequence: 1, config_revision: 3, state: "pending",
  } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("separates desired, observed and applied state and never turns missing capacity into zero", async () => {
  render(<IPFSManagedStatus document={document} dirty={false} onReload={() => {}} />);
  expect(await screen.findByText("stopped")).toBeTruthy();
  expect(screen.getByText("running")).toBeTruthy();
  expect(screen.getByText("2 / 3")).toBeTruthy();
  expect(screen.getAllByText("Unavailable")).toHaveLength(2);
  expect(screen.getByText("Waiting for a fresh storage measurement")).toBeTruthy();
  expect(screen.getAllByText("20.0 GiB")).toHaveLength(2);
  expect(screen.getByText("2026-09-17T08:00:00Z")).toBeTruthy();
});

it.each([["recovering_copy_cleanup", "Finishing interrupted pin cleanup"], ["disabled", "Publication is paused"],
  ["future_reason", "Pinning paused"]])("explains %s without displaying internal codes", async (reason, label) => {
  vi.mocked(api.getIPFSStatus).mockResolvedValue({ ...status, capacity: { ...status.capacity!, admission_paused_reason: reason } });
  render(<IPFSManagedStatus document={document} dirty={false} onReload={() => {}} />);
  expect(await screen.findByText(label)).toBeTruthy();
  expect(screen.queryByText(reason)).toBeNull();
});

it.each(["dirty", "external", "unavailable", "unadopted"])("blocks lifecycle writes when %s", async (reason) => {
  if (reason === "unavailable") vi.mocked(api.getIPFSStatus).mockResolvedValue({ ...status, management: { ...status.management!, available: false } });
  render(<IPFSManagedStatus document={{ ...document, policy_active: reason !== "unadopted",
    config: { ...document.config, provider: reason === "external" ? "external" : "internal" } }} dirty={reason === "dirty"} onReload={() => {}} />);
  const restart = await screen.findByRole("button", { name: "Restart internal node" });
  expect(restart).toHaveProperty("disabled", true);
  fireEvent.click(restart);
  expect(api.runIPFSOperation).not.toHaveBeenCalled();
});

it("reuses the request id after an uncertain result and blocks duplicate accepted work until observed complete", async () => {
  vi.mocked(api.runIPFSOperation).mockRejectedValueOnce(new Error("connection lost"));
  render(<IPFSManagedStatus document={document} dirty={false} onReload={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Restart internal node" }));
  const retry = await screen.findByRole("button", { name: "Retry restart request" });
  const request = vi.mocked(api.runIPFSOperation).mock.calls[0][1];
  expect(request).toEqual({ expected_revision: 3, request_id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  fireEvent.click(retry);
  await waitFor(() => expect(api.runIPFSOperation).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.runIPFSOperation).mock.calls[1]).toEqual(["restart", request]);
  expect(await screen.findByText("pending")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Restart internal node" })).toHaveProperty("disabled", true);
  vi.mocked(api.getIPFSStatus).mockResolvedValue({ ...status, management: { ...status.management!,
    operation: { ...(await vi.mocked(api.runIPFSOperation).mock.results[1].value).operation, state: "succeeded" } } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh node status" }));
  expect(await screen.findByText("succeeded")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Restart internal node" })).toHaveProperty("disabled", false);
});

it("polls status while mounted and cancels the next poll on unmount", async () => {
  vi.useFakeTimers();
  const { unmount } = render(<IPFSManagedStatus document={document} dirty={false} onReload={() => {}} />);
  await act(async () => {});
  expect(api.getIPFSStatus).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(5_000); });
  expect(api.getIPFSStatus).toHaveBeenCalledTimes(2);
  unmount();
  await act(async () => { vi.advanceTimersByTime(5_000); });
  expect(api.getIPFSStatus).toHaveBeenCalledTimes(2);
});
