// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminNavLink, ModerationNavLink, RoleNavLink } from "./RoleNavLink";

let sessionUser: { id: string; role?: string } | null = null;
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: sessionUser }),
}));

beforeEach(() => {
  sessionUser = null;
});
afterEach(cleanup);

describe("RoleNavLink", () => {
  // Self-hiding, not prompting: an entry a viewer cannot use should not be in
  // the nav at all. (RoleGate is the one that explains itself, on a route.)
  it("renders nothing for an anonymous viewer", () => {
    const { container } = render(<RoleNavLink minRole="moderator" href="/x" label="X" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for a regular user", () => {
    sessionUser = { id: "u1", role: "user" };
    const { container } = render(<RoleNavLink minRole="moderator" href="/x" label="X" />);
    expect(container.innerHTML).toBe("");
  });

  it("lets a moderator through a moderator link", () => {
    sessionUser = { id: "u1", role: "moderator" };
    render(<RoleNavLink minRole="moderator" href="/moderation" label="Moderation" />);
    expect(screen.getByRole("link", { name: "Moderation" }).getAttribute("href")).toBe(
      "/moderation",
    );
  });

  it("keeps a moderator out of an admin link", () => {
    sessionUser = { id: "u1", role: "moderator" };
    const { container } = render(<RoleNavLink minRole="admin" href="/admin/users" label="Admin" />);
    expect(container.innerHTML).toBe("");
  });

  it("lets an admin through both", () => {
    sessionUser = { id: "u1", role: "admin" };
    render(
      <>
        <AdminNavLink />
        <ModerationNavLink />
      </>,
    );
    expect(screen.getByRole("link", { name: "Admin" }).getAttribute("href")).toBe("/admin/users");
    expect(screen.getByRole("link", { name: "Moderation" }).getAttribute("href")).toBe(
      "/moderation",
    );
  });

  it("defaults to a focusable nav style and lets a caller restyle it", () => {
    sessionUser = { id: "u1", role: "admin" };
    const { rerender } = render(<AdminNavLink />);
    expect(screen.getByRole("link", { name: "Admin" }).className).toContain("focus-ring");
    rerender(<AdminNavLink className="block px-4 py-2" />);
    expect(screen.getByRole("link", { name: "Admin" }).className).toBe("block px-4 py-2");
  });
});
