// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { ensureDevice } = vi.hoisted(() => ({ ensureDevice: vi.fn() }));
vi.mock("@/lib/e2ee/prepare", () => ({ prepareDevice: ensureDevice }));
import { DeviceSetup } from "./DeviceSetup";
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const device = { device_id: "d", device_name: "This browser", fingerprint: "f" };
it("prepares this browser automatically without asking the user for a key or name", async () => {
  ensureDevice.mockResolvedValue(device);
  const ready = vi.fn();
  render(<DeviceSetup onReady={ready} />);
  await waitFor(() => expect(ready).toHaveBeenCalledWith(device));
  expect(screen.queryByLabelText("Device name")).toBeNull();
});
it("shows a recoverable failure and retries without losing the conversation", async () => {
  ensureDevice.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(device);
  const ready = vi.fn();
  render(<DeviceSetup onReady={ready} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(ready).toHaveBeenCalledWith(device));
  expect(ensureDevice).toHaveBeenCalledTimes(2);
});
