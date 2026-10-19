import { afterEach, expect, it, vi } from "vitest";
const { provider, store } = vi.hoisted(() => ({ provider: vi.fn(), store: vi.fn() }));
vi.mock("./crypto", () => ({ getCryptoProvider: provider }));
vi.mock("./account-store", () => ({ accountStore: store }));
import { getEngine, __resetEngineSingletonForTest } from "./engine";
import { setE2EEUser } from "./session";
afterEach(() => { setE2EEUser(null); __resetEngineSingletonForTest(); vi.clearAllMocks(); });
it("shares concurrent first loads and creates a separate engine on account changes", async () => {
  provider.mockResolvedValue({});
  store.mockResolvedValue({});
  setE2EEUser("a");
  const [first, second] = await Promise.all([getEngine(), getEngine()]);
  expect(first).toBe(second);
  expect(provider).toHaveBeenCalledTimes(1);
  setE2EEUser("b");
  expect(await getEngine()).not.toBe(first);
  expect(store.mock.calls.map((args) => args[0])).toEqual(["a", "b"]);
});
it("rejects a provider load that resumes after signing out", async () => {
  let resolve!: (value: unknown) => void;
  provider.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  setE2EEUser("a");
  const loading = getEngine();
  setE2EEUser(null);
  resolve({});
  await expect(loading).rejects.toThrow(/account changed/);
  expect(store).not.toHaveBeenCalled();
});
