// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { status: "restoring", user: null as { role: string } | null },
}));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => mocks.session }));

import { RoleGate } from "./RoleGate";

beforeEach(() => {
  mocks.session = { status: "restoring", user: null };
});
afterEach(cleanup);

describe("RoleGate", () => {
  it("holds while the session is still restoring — an admin must not be told they are not one", () => {
    render(
      <RoleGate minRole="admin" action="manage users">
        <p>console</p>
      </RoleGate>,
    );
    expect(screen.queryByText("Administrators only")).toBeNull();
    expect(screen.queryByText("console")).toBeNull();
  });

  it("lets an admin through once the session settles", () => {
    mocks.session = { status: "authed", user: { role: "admin" } };
    render(
      <RoleGate minRole="admin" action="manage users">
        <p>console</p>
      </RoleGate>,
    );
    expect(screen.getByText("console")).toBeTruthy();
  });

  it("offers a signed-out visitor the sign-in they actually need", () => {
    mocks.session = { status: "anon", user: null };
    render(
      <RoleGate minRole="admin" action="manage users">
        <p>console</p>
      </RoleGate>,
    );
    expect(screen.getByText("Administrators only")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("does not tell a signed-in viewer to sign in — they already are", () => {
    mocks.session = { status: "authed", user: { role: "user" } };
    render(
      <RoleGate minRole="admin" action="manage users">
        <p>console</p>
      </RoleGate>,
    );
    expect(screen.getByText("Administrators only")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByText(/does not have access/i)).toBeTruthy();
  });
});
