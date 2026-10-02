// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: { createAdminUserPasswordResetLink: mocks.create },
}));

import { ApiError } from "@/lib/api";
import type { AdminUser } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

import { PasswordResetLinkCard } from "./PasswordResetLinkCard";

const URL_ = "https://vidra.example/reset-password/confirm?token=s3cr3t-token";
const EXPIRES = "2026-10-02T14:30:00Z";

function target(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "user-9",
    username: "ada",
    role: "user",
    is_active: true,
    is_owner: false,
    ...overrides,
  } as AdminUser;
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: /create password reset link for ada/i }));
  return screen.getByRole("dialog");
}

// A neutral fixture, not password-shaped: secret scanners flag `password = "<literal>"`.
const TYPED = "fixture-typed-value";

function submit(typed = TYPED) {
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/your password/i), { target: { value: typed } });
  fireEvent.click(within(dialog).getByRole("button", { name: /^create link$/i }));
}

describe("PasswordResetLinkCard", () => {
  beforeEach(() => {
    mocks.create.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is offered for an ordinary account only", () => {
    for (const overrides of [{ role: "admin" }, { role: "moderator" }, { is_owner: true }] as const) {
      const { unmount } = render(<PasswordResetLinkCard user={target(overrides)} />);
      expect(screen.queryByRole("button", { name: /create password reset link/i })).toBeNull();
      unmount();
    }
    render(<PasswordResetLinkCard user={target()} />);
    expect(screen.getByRole("button", { name: /create password reset link for ada/i })).toBeTruthy();
  });

  it("asks for the admin's own password and keeps submit disabled until it is typed", () => {
    render(<PasswordResetLinkCard user={target()} />);
    const dialog = open();
    const button = within(dialog).getByRole("button", { name: /^create link$/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/your password/i), { target: { value: "x" } });
    expect(button.disabled).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("shows the link read-only with the warning and the local expiry, and stores nothing", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.create.mockResolvedValue({ reset_url: URL_, expires_at: EXPIRES });
    render(<PasswordResetLinkCard user={target()} />);
    open();
    submit();

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("user-9", { password: TYPED }));
    const field = (await screen.findByLabelText(/^reset link$/i)) as HTMLInputElement;
    expect(field.value).toBe(URL_);
    expect(field.readOnly).toBe(true);

    const text = screen.getByRole("dialog").textContent ?? "";
    const when = formatDateTime(EXPIRES);
    expect(text).toContain("Anyone with this link can set a new password for this account.");
    expect(text).toContain("Send it to the user over a channel you trust.");
    expect(text).toContain(`It works once and expires at ${when}.`);
    expect(text).toContain("Creating another link cancels this one.");
    // The admin's password is gone from the form once it has been spent.
    expect(screen.queryByLabelText(/your password/i)).toBeNull();

    expect(setItem).not.toHaveBeenCalled();
    for (const spy of [log, warn, err]) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain("s3cr3t-token");
    }
  });

  it("disables submit while the request is pending", async () => {
    let resolve!: (v: unknown) => void;
    mocks.create.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<PasswordResetLinkCard user={target()} />);
    const dialog = open();
    submit();

    const button = await within(dialog).findByRole("button", { name: /creating/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.create).toHaveBeenCalledTimes(1);

    resolve({ reset_url: URL_, expires_at: EXPIRES });
    await screen.findByLabelText(/^reset link$/i);
  });
});
