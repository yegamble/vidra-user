// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: "anon" as "restoring" | "anon" | "authed",
  remember: vi.fn(),
  reload: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/components/auth/AuthProvider", () => ({ useOptionalSession: () => ({ status: mocks.status }) }));
vi.mock("@/lib/age-gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/age-gate")>()),
  rememberAgeConfirmation: mocks.remember,
  reloadForAgeGate: mocks.reload,
  clearAgeGateReload: mocks.clear,
}));

import { navigation, navigationMock } from "@/lib/test-navigation";

import { AgeGate } from "./AgeGate";

function renderGate(pending = true) {
  return render(
    <AgeGate pending={pending} minimumAge={18}>
      <p>the catalogue</p>
    </AgeGate>,
  );
}
const page = () => screen.queryByText("the catalogue");

beforeEach(() => {
  navigation.reset("/");
  mocks.status = "anon";
  mocks.remember.mockReset().mockReturnValue(true);
  mocks.reload.mockReset().mockReturnValue(true);
  mocks.clear.mockReset();
});
afterEach(cleanup);

describe("AgeGate", () => {
  it("shows the page when the server found nothing to ask", () => {
    renderGate(false);
    expect(page()).not.toBeNull();
    expect(mocks.clear).toHaveBeenCalled();
  });

  it("asks a visitor without an account first and never mounts the page", () => {
    renderGate();
    expect(screen.getByRole("heading", { name: "Confirm your age" })).toBeTruthy();
    expect(screen.getByText("This site is only for people aged 18 or older.")).toBeTruthy();
    expect(page()).toBeNull();
  });

  it("asks on a restoring session too, so the server-rendered page is the gate", () => {
    mocks.status = "restoring";
    renderGate();
    expect(page()).toBeNull();
    expect(mocks.remember).not.toHaveBeenCalled();
  });

  it("stores the age and reloads on Enter, so the server renders the page", () => {
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "I am 18 or older" }));
    expect(mocks.remember).toHaveBeenCalledWith(18);
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(page()).toBeNull();
  });

  it("shows the page for this view only when the browser refuses the cookie", () => {
    mocks.remember.mockReturnValue(false);
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "I am 18 or older" }));
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(page()).not.toBeNull();
  });

  it("shows the page when this tab already reloaded once for the gate", () => {
    mocks.reload.mockReturnValue(false);
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "I am 18 or older" }));
    expect(page()).not.toBeNull();
  });

  it("answers Leave with a closing message, never the page", () => {
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(screen.getByRole("heading", { name: "You chose to leave" })).toBeTruthy();
    expect(page()).toBeNull();
    expect(mocks.remember).not.toHaveBeenCalled();
  });

  it("lets a signed-in account through without asking, remembering it without a reload", () => {
    mocks.status = "authed";
    renderGate();
    expect(mocks.remember).toHaveBeenCalledWith(18);
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Confirm your age" })).toBeNull();
    expect(page()).not.toBeNull();
  });

  it("leaves the sign-in page open, and asks again after a client navigation away from it", () => {
    navigation.reset("/login");
    renderGate();
    expect(page()).not.toBeNull();
    act(() => navigationMock.useRouter().push("/videos/abc"));
    expect(page()).toBeNull();
    expect(screen.getByRole("heading", { name: "Confirm your age" })).toBeTruthy();
  });
});
