// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminUsers: vi.fn(),
  updateAdminUser: vi.fn(),
  deleteAdminUser: vi.fn(),
}));

// A stub that really re-renders on navigation: the list window lives in the URL
// now, so "did paging refetch" is only a real assertion if replace() propagates.
vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/components/RoleGate", () => ({
  RoleGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: { id: "admin-1", role: "admin" } }),
}));
vi.mock("@/lib/api", () => ({
  api: {
    getAdminUsers: mocks.getAdminUsers,
    updateAdminUser: mocks.updateAdminUser,
    deleteAdminUser: mocks.deleteAdminUser,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { AdminUsersView } from "@/components/AdminUsersView";
import { navigation } from "@/lib/test-navigation";

// The instance from the bug report: 4,649 accounts, 10 to a page.
const TOTAL = 4649;
const PAGE = 10;

function account(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `user-${index}`,
    username: `person${index}`,
    display_name: `Person ${index}`,
    email: `person${index}@example.com`,
    email_verified: true,
    role: "user" as const,
    is_active: true,
    bypass_quarantine: false,
    storage_used_bytes: 0,
    storage_quota_bytes: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** A page of `count` accounts starting at `offset`, out of `total`. */
function page(offset: number, count: number, total = TOTAL) {
  return {
    users: Array.from({ length: count }, (_, i) => account(offset + i)),
    total,
    limit: PAGE,
    offset,
  };
}

beforeEach(() => {
  navigation.reset("/admin/users");
  mocks.getAdminUsers.mockReset();
  mocks.updateAdminUser.mockReset();
  mocks.deleteAdminUser.mockReset();
});

afterEach(() => cleanup());

/** The arguments of the Nth getAdminUsers call, which is the Nth page request. */
function requestedPage(call: number) {
  return mocks.getAdminUsers.mock.calls[call]?.[0];
}

describe("AdminUsersView pagination", () => {
  it("asks for one page and reports where in the instance it is", async () => {
    mocks.getAdminUsers.mockResolvedValue(page(0, PAGE));
    render(<AdminUsersView />);

    await screen.findByRole("navigation", { name: "Paginate users" });
    expect(requestedPage(0)).toMatchObject({ limit: PAGE, offset: 0 });
    expect(screen.getByText("1–10 of 4649")).toBeTruthy();
    // Nothing before the first page.
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
  });

  it("pages forward and back over limit/offset", async () => {
    mocks.getAdminUsers.mockResolvedValueOnce(page(0, PAGE));
    render(<AdminUsersView />);
    await screen.findByText("1–10 of 4649");

    mocks.getAdminUsers.mockResolvedValueOnce(page(PAGE, PAGE));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("11–20 of 4649");
    expect(requestedPage(1)).toMatchObject({ offset: PAGE });
    // The second page can go both ways.
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(false);

    mocks.getAdminUsers.mockResolvedValueOnce(page(0, PAGE));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("1–10 of 4649");
    expect(requestedPage(2)).toMatchObject({ offset: 0 });
  });

  it("stops at the last page", async () => {
    // 4,649 accounts, 10 to a page: the last page starts at 4,640 and holds 9.
    mocks.getAdminUsers.mockResolvedValue(page(4640, 9));
    render(<AdminUsersView />);

    await screen.findByText("4641–4649 of 4649");
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps the readout and the size picker even when everything fits on one page", async () => {
    mocks.getAdminUsers.mockResolvedValue(page(0, 3, 3));
    render(<AdminUsersView />);

    await screen.findByRole("button", { name: "Open person0" });
    // Both steps are dead ends, but the rows-per-page picker is the only way to
    // change the page size — hiding it here would strand it.
    expect(screen.getByText("1–3 of 3")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
  });

  it("changes the page size and starts the new-sized window at the top", async () => {
    mocks.getAdminUsers.mockResolvedValueOnce(page(0, PAGE));
    render(<AdminUsersView />);
    await screen.findByText("1–10 of 4649");

    mocks.getAdminUsers.mockResolvedValueOnce({ ...page(0, 20), limit: 20 });
    fireEvent.change(screen.getByRole("combobox", { name: "Rows per page" }), {
      target: { value: "20" },
    });

    await waitFor(() => expect(mocks.getAdminUsers).toHaveBeenCalledTimes(2));
    expect(requestedPage(1)).toMatchObject({ limit: 20, offset: 0 });
  });

  it("puts the window in the URL, so a page is a link", async () => {
    mocks.getAdminUsers.mockResolvedValue(page(0, PAGE));
    render(<AdminUsersView />);
    await screen.findByText("1–10 of 4649");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(navigation.lastUrl()).toBe("/admin/users?offset=10");
  });

  it("keeps the pager on an empty page past the first, so the operator can get back", async () => {
    // What deleting the last account on the last page leaves behind.
    mocks.getAdminUsers.mockResolvedValue(page(4600, 0, 4600));
    render(<AdminUsersView />);

    await screen.findByText("Nothing on this page");
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(false);
  });
});

describe("AdminUsersView search", () => {
  it("resets to the first page when the search changes", async () => {
    mocks.getAdminUsers.mockResolvedValueOnce(page(0, PAGE));
    render(<AdminUsersView />);
    await screen.findByText("1–10 of 4649");

    mocks.getAdminUsers.mockResolvedValueOnce(page(PAGE, PAGE));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("11–20 of 4649");

    // Searching from page 2 must not ask for offset 10 of a result set that has
    // no page 2 — that would answer with an empty page reading as "no matches".
    mocks.getAdminUsers.mockResolvedValueOnce(page(0, 2, 2));
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(mocks.getAdminUsers).toHaveBeenCalledTimes(3));
    expect(requestedPage(2)).toMatchObject({ q: "ada", offset: 0 });
  });

  it("clearing the search also returns to the first page", async () => {
    mocks.getAdminUsers.mockResolvedValueOnce(page(0, 2, 2));
    render(<AdminUsersView />);
    await screen.findByRole("button", { name: "Open person0" });

    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "ada" } });
    mocks.getAdminUsers.mockResolvedValueOnce(page(0, 1, 1));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(mocks.getAdminUsers).toHaveBeenCalledTimes(2));

    mocks.getAdminUsers.mockResolvedValueOnce(page(0, PAGE));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(mocks.getAdminUsers).toHaveBeenCalledTimes(3));
    expect(requestedPage(2)).toMatchObject({ q: undefined, offset: 0 });
  });

  it("tracks the total of the filtered set, not the instance", async () => {
    mocks.getAdminUsers.mockResolvedValueOnce(page(0, PAGE));
    render(<AdminUsersView />);
    await screen.findByText("1–10 of 4649");

    // The backend counts with the request's own q, so a filtered page reports
    // the size of its own result set.
    mocks.getAdminUsers.mockResolvedValueOnce(page(0, PAGE, 250));
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await screen.findByText("1–10 of 250");
  });
});

describe("AdminUsersView facet counts", () => {
  it("says the counts are page-scoped once a second page exists", async () => {
    mocks.getAdminUsers.mockResolvedValue({
      users: [
        account(0, { role: "admin" }),
        account(1, { role: "moderator" }),
        account(2, { is_active: false }),
        account(3),
      ],
      total: TOTAL,
      limit: PAGE,
      offset: 0,
    });
    render(<AdminUsersView />);

    // Counted over the loaded rows — which is all they can ever be.
    const facets = await screen.findByRole("group", { name: "Filter this page of users" });
    expect(facets.textContent).toContain("· 4");
    expect(facets.textContent).toContain("· 2");
    expect(facets.textContent).toContain("· 1");
    // And the number next to 4,649 accounts is not allowed to read as a total.
    expect(
      screen.getByText(/accounts on\s+this page, not all/).textContent?.replace(/\s+/g, " "),
    ).toContain("not all 4649");
  });

  it("drops the caveat when the page is the whole instance", async () => {
    mocks.getAdminUsers.mockResolvedValue({
      users: [account(0, { role: "admin" }), account(1)],
      total: 2,
      limit: PAGE,
      offset: 0,
    });
    render(<AdminUsersView />);

    const facets = await screen.findByRole("group", { name: "Filter this page of users" });
    expect(facets.textContent).toContain("· 2");
    expect(screen.queryByText(/not all/)).toBeNull();
  });

  it("a facet that empties a page does not claim the instance has none", async () => {
    mocks.getAdminUsers.mockResolvedValue(page(0, PAGE));
    render(<AdminUsersView />);
    await screen.findByText("1–10 of 4649");

    // Not one staff account on this page of 10 regular users.
    fireEvent.click(screen.getByRole("button", { name: /^Staff/ }));

    const empties = await screen.findAllByText(
      "No accounts on this page match this filter. Try another page, or another facet.",
    );
    expect(empties.length).toBeGreaterThan(0);
  });
});

// A hard-deleted account is not a deactivated one. The A12 deletion slice found
// the console listing a tombstone as `deleted-<suffix>` with working Reactivate
// and Delete actions: Reactivate republished a public profile for an account
// that had asked to be erased, restoring nothing, and Delete on an already-gone
// row is a 404. Core now refuses the reactivation (422) and reports deleted_at;
// this is the half that stops the operator being offered the action at all.
describe("AdminUsersView tombstones", () => {
  const deleted = () =>
    account(0, {
      username: "deleted-312a3b06",
      display_name: "",
      is_active: false,
      deleted_at: "2026-09-05T10:00:00Z",
    });

  it("labels a deleted account Deleted, not Deactivated", async () => {
    mocks.getAdminUsers.mockResolvedValue({ users: [deleted()], total: 1, limit: PAGE, offset: 0 });
    render(<AdminUsersView />);

    // The table row's own status cell — not the "Deactivated" facet chip, which
    // is a filter label and stays whatever the page holds.
    const row = await screen.findByRole("button", { name: "Open deleted-312a3b06" });
    expect(row.textContent).toContain("Deleted");
    expect(row.textContent).not.toContain("Deactivated");
  });

  it("offers no Reactivate and no Delete on a tombstone", async () => {
    mocks.getAdminUsers.mockResolvedValue({ users: [deleted()], total: 1, limit: PAGE, offset: 0 });
    render(<AdminUsersView />);
    await screen.findByRole("button", { name: "Open deleted-312a3b06" });

    expect(screen.queryAllByRole("button", { name: /^Reactivate/ })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /^Delete .* permanently$/ })).toHaveLength(0);
    // The row is still there to read, and it says why nothing can be done to it.
    expect(screen.getAllByText(/permanently deleted/i).length).toBeGreaterThan(0);
  });

  it("still offers both actions on a merely deactivated account", async () => {
    mocks.getAdminUsers.mockResolvedValue({
      users: [account(0, { is_active: false, deleted_at: null })],
      total: 1,
      limit: PAGE,
      offset: 0,
    });
    render(<AdminUsersView />);

    expect((await screen.findAllByRole("button", { name: /^Reactivate/ })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /permanently$/ }).length).toBeGreaterThan(0);
  });
});

// PATCH /admin/users/{id} has accepted email_verified and bypass_quarantine
// since §10/§11, and the console displayed both as read-only facts — an admin
// could see that an account was unverified or quarantine-exempt and had no way
// to change it without curl.
describe("AdminUsersView account flags", () => {
  it("marks an address verified and revokes it again", async () => {
    mocks.getAdminUsers.mockResolvedValue({
      users: [account(0, { email_verified: false })],
      total: 1,
      limit: PAGE,
      offset: 0,
    });
    mocks.updateAdminUser.mockResolvedValue(account(0, { email_verified: true }));
    render(<AdminUsersView />);

    const [toggle] = await screen.findAllByRole("switch", { name: /Email verified for person0/ });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(mocks.updateAdminUser).toHaveBeenCalledWith("user-0", { email_verified: true }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("switch", { name: /Email verified for person0/ })[0].getAttribute("aria-checked"),
      ).toBe("true"),
    );

    fireEvent.click(screen.getAllByRole("switch", { name: /Email verified for person0/ })[0]);
    await waitFor(() =>
      expect(mocks.updateAdminUser).toHaveBeenLastCalledWith("user-0", { email_verified: false }),
    );
  });

  it("exempts an account from the new-upload quarantine", async () => {
    mocks.getAdminUsers.mockResolvedValue({
      users: [account(0, { bypass_quarantine: false })],
      total: 1,
      limit: PAGE,
      offset: 0,
    });
    mocks.updateAdminUser.mockResolvedValue(account(0, { bypass_quarantine: true }));
    render(<AdminUsersView />);

    const [toggle] = await screen.findAllByRole("switch", {
      name: /Exempt person0 from new-upload quarantine/,
    });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(mocks.updateAdminUser).toHaveBeenCalledWith("user-0", { bypass_quarantine: true }),
    );
  });

  it("offers neither flag on a tombstone", async () => {
    mocks.getAdminUsers.mockResolvedValue({
      users: [account(0, { deleted_at: "2026-09-05T10:00:00Z", is_active: false })],
      total: 1,
      limit: PAGE,
      offset: 0,
    });
    render(<AdminUsersView />);
    await screen.findByRole("button", { name: "Open person0" });

    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });
});
