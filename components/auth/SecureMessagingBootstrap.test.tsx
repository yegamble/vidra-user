// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { prepare, session, features } = vi.hoisted(() => ({
  prepare: vi.fn(), session: { status: "authed", user: { id: "a" } },
  features: { value: { messaging: true, messaging_e2ee: true } as Record<string, boolean | undefined> | null },
}));
vi.mock("./AuthProvider", () => ({ useSession: () => session }));
vi.mock("@/lib/instance-features", () => ({ useInstanceFeatures: () => features.value }));
vi.mock("@/lib/e2ee/prepare", () => ({ prepareDevice: prepare }));
import { SecureMessagingBootstrap } from "./SecureMessagingBootstrap";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("prepares encryption while a signed-in user browses anywhere", async () => {
  prepare.mockResolvedValue({});
  render(<SecureMessagingBootstrap />);
  await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
});
it.each(["anon", "restoring"])("does not prepare for a %s session", (status) => {
  session.status = status;
  render(<SecureMessagingBootstrap />);
  expect(prepare).not.toHaveBeenCalled();
  session.status = "authed";
});
it.each([null, {}, { messaging: false, messaging_e2ee: true }, { messaging_e2ee: false }])("does not register when disabled or undisclosed: %j", (value) => {
  features.value = value;
  render(<SecureMessagingBootstrap />);
  expect(prepare).not.toHaveBeenCalled();
  features.value = { messaging: true, messaging_e2ee: true };
});
