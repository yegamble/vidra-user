// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError, api, type IPFSConfigDocument } from "@/lib/api";
import { IPFSPolicyForm } from "./IPFSPolicyForm";
vi.mock("./IPFSManagedStatus", () => ({ IPFSManagedStatus: ({ dirty }: { dirty: boolean }) => <button disabled={dirty}>Node action fixture</button> }));

const saved: IPFSConfigDocument = { revision: 3, policy_active: false, config: {
  provider: "internal", enabled: false, auto_pin_new: true, demand_pin: false,
  backfill_enabled: false, budget_bytes: 20 * 1024 ** 3, min_free_bytes: 20 * 1024 ** 3,
  copy_bytes_per_second: 2 * 1024 ** 2, workers: 1,
} };
beforeEach(() => {
  vi.spyOn(api, "getIPFSConfig").mockResolvedValue(saved);
  vi.spyOn(api, "updateIPFSConfig").mockResolvedValue({ ...saved, revision: 4, policy_active: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("explains the operator-managed capacity tradeoff before policy adoption", async () => {
  render(<IPFSPolicyForm onSaved={() => {}} />);
  fireEvent.change(await screen.findByLabelText("Node provider"), { target: { value: "external" } });
  expect(screen.getByText(/Saving adopts capacity checks; copying pauses when host usage cannot be measured/)).toBeTruthy();
  expect(api.updateIPFSConfig).not.toHaveBeenCalled();
});

it("loads without adopting policy and saves the complete document with revision and byte units", async () => {
  const onSaved = vi.fn();
  render(<IPFSPolicyForm onSaved={onSaved} />);
  const enabled = await screen.findByRole("checkbox", { name: "Publish eligible public content" });
  expect(api.updateIPFSConfig).not.toHaveBeenCalled();
  expect(screen.getByText(/Existing deployment policy remains active until/)).toBeTruthy();
  fireEvent.click(enabled);
  fireEvent.change(screen.getByLabelText("Pin storage budget (GiB)"), { target: { value: "21.5" } });
  expect(screen.getByRole("button", { name: "Node action fixture" })).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "Save IPFS policy" }));
  await waitFor(() => expect(api.updateIPFSConfig).toHaveBeenCalledWith({ expected_revision: 3,
    config: { ...saved.config, enabled: true, budget_bytes: 21.5 * 1024 ** 3 } }));
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "Policy saved. Node status is reported separately.");
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it("keeps a conflicting draft and requires explicit reload before saving the newer revision", async () => {
  vi.mocked(api.updateIPFSConfig).mockRejectedValueOnce(new ApiError({ status: 409, code: "ipfs_config_conflict", message: "Changed" }));
  render(<IPFSPolicyForm onSaved={() => {}} />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Publish eligible public content" }));
  fireEvent.click(screen.getByRole("button", { name: "Save IPFS policy" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Your draft is kept"));
  expect(screen.getByRole("checkbox", { name: "Publish eligible public content" })).toHaveProperty("checked", true);
  expect(screen.getByRole("button", { name: "Save IPFS policy" })).toHaveProperty("disabled", true);
  vi.mocked(api.getIPFSConfig).mockResolvedValue({ ...saved, revision: 7 });
  fireEvent.click(screen.getByRole("button", { name: "Reload saved settings" }));
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Publish eligible public content" })).toHaveProperty("checked", false));
  fireEvent.click(screen.getByRole("button", { name: "Save IPFS policy" }));
  await waitFor(() => expect(api.updateIPFSConfig).toHaveBeenLastCalledWith({ expected_revision: 7, config: saved.config }));
});

it.each(["", "0", "1.00000000001", "1048577"])("rejects unsupported budget %j before writing", async (value) => {
  render(<IPFSPolicyForm onSaved={() => {}} />);
  const budget = await screen.findByLabelText("Pin storage budget (GiB)");
  fireEvent.change(budget, { target: { value } });
  fireEvent.submit(screen.getByRole("form", { name: "IPFS publication policy" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("supported limits"));
  expect(api.updateIPFSConfig).not.toHaveBeenCalled();
});

it("keeps failed writes editable and explains that publication and delivery are separate", async () => {
  vi.mocked(api.updateIPFSConfig).mockRejectedValue(new Error("Offline"));
  render(<IPFSPolicyForm onSaved={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Save IPFS policy" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not save IPFS policy.");
  expect(screen.getByRole("button", { name: "Save IPFS policy" })).toHaveProperty("disabled", false);
  expect(screen.getByText(/Pausing publication keeps privacy withdrawals running/)).toBeTruthy();
  expect(screen.getByText(/IPFS delivery is a separate/)).toBeTruthy();
});
