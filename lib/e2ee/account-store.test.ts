import { beforeEach, expect, it, vi } from "vitest";
const { stores, directory, restore } = vi.hoisted(() => ({
  stores: new Map<string, { record: unknown }>(), directory: vi.fn(), restore: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: { listMyE2EEDevices: directory } }));
vi.mock("./store", () => ({ IndexedDBStore: class {
  data: { record: unknown };
  constructor(readonly name = "vidra-e2ee") {
    if (!stores.has(name)) stores.set(name, { record: null });
    this.data = stores.get(name)!;
  }
  async load() { return this.data.record; }
} }));
import { accountStore } from "./account-store";
import type { CryptoProvider } from "./crypto";
const provider = { restore } as unknown as CryptoProvider;
const record = { deviceId: "old", pickle: "private", pickleKey: "local" };
const own = { id: "old", identity_key: "identity", signing_key: "signing" };
beforeEach(() => {
  stores.clear();
  directory.mockReset().mockResolvedValue({ devices: [own] });
  restore.mockReset().mockResolvedValue({ identityKey: "identity", signingKey: "signing", dispose: vi.fn() });
});
it("uses separate databases for different accounts", async () => {
  const a = await accountStore("a", provider, () => {});
  const b = await accountStore("b", provider, () => {});
  expect(a).not.toBe(b);
  expect(stores.has("vidra-e2ee:a")).toBe(true);
  expect(stores.has("vidra-e2ee:b")).toBe(true);
});
it("preserves a legacy device and its caches only for its proven owner", async () => {
  stores.set("vidra-e2ee", { record });
  const adopted = await accountStore("a", provider, () => {});
  expect(await adopted.load()).toBe(record);
  directory.mockResolvedValue({ devices: [{ ...own, signing_key: "different" }] });
  const other = await accountStore("b", provider, () => {});
  expect(await other.load()).toBeNull();
  expect(stores.get("vidra-e2ee")?.record).toBe(record);
});
it("does not interpret a failed ownership lookup as a missing device", async () => {
  stores.set("vidra-e2ee", { record });
  directory.mockRejectedValue(new Error("offline"));
  await expect(accountStore("a", provider, () => {})).rejects.toThrow("offline");
});
