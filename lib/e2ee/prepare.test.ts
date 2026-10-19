import { afterEach, expect, it, vi } from "vitest";
const { engine } = vi.hoisted(() => ({ engine: { ensureDevice: vi.fn(), currentDevice: vi.fn(), replenishOneTimeKeys: vi.fn() } }));
vi.mock("./engine", () => ({ getEngine: async () => engine }));
import { prepareDevice } from "./prepare";
import { setE2EEUser } from "./session";
afterEach(() => { setE2EEUser(null); vi.resetAllMocks(); });
it("keeps an activated browser available during a transient background preparation failure", async () => {
  setE2EEUser("a");
  const current = { device_id: "a-device" };
  engine.ensureDevice.mockRejectedValue(new Error("offline"));
  engine.currentDevice.mockResolvedValue(current);
  engine.replenishOneTimeKeys.mockResolvedValue(undefined);
  await expect(prepareDevice()).resolves.toBe(current);
});
it("does not bypass initial activation or a removed device", async () => {
  setE2EEUser("a");
  engine.ensureDevice.mockRejectedValue(new Error("offline"));
  engine.currentDevice.mockResolvedValue(null);
  await expect(prepareDevice()).rejects.toThrow("offline");
  const removed = new Error("removed"); removed.name = "DeviceRemovedError";
  engine.ensureDevice.mockRejectedValue(removed);
  engine.currentDevice.mockResolvedValue({ device_id: "removed" });
  await expect(prepareDevice()).rejects.toThrow("removed");
});
