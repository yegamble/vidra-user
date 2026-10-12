// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: { createAdminUser: mocks.create },
}));

import { ApiError } from "@/lib/api";

import { CreateUserDialog } from "./CreateUserDialog";

const LINK = "https://vidra.example/reset-password/confirm?token=s3cr3t-token";
const EXPIRES = "2026-10-02T14:30:00Z";
// Neutral fixture value: secret scanners flag `password = "<literal>"`.
const TYPED = "fixture-typed-value";

function fill() {
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/^username/i), { target: { value: "nina" } });
  fireEvent.change(within(dialog).getByLabelText(/^email/i), { target: { value: "nina@example.test" } });
  fireEvent.click(within(dialog).getByRole("button", { name: /moderator/i }));
  fireEvent.change(within(dialog).getByLabelText(/your password/i), { target: { value: TYPED } });
  fireEvent.click(within(dialog).getByRole("button", { name: /^create user$/i }));
}

describe("CreateUserDialog", () => {
  beforeEach(() => {
    mocks.create.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends username, email, role and the admin's own password", async () => {
    mocks.create.mockResolvedValue({ user: { id: "u1" }, link_emailed: true, expires_at: EXPIRES });
    const onCreated = vi.fn();
    render(<CreateUserDialog onClose={() => {}} onCreated={onCreated} />);
    fill();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({
      username: "nina",
      email: "nina@example.test",
      role: "moderator",
      password: TYPED,
    });
  });

  it("tells the admin the link was emailed, with no link shown", async () => {
    mocks.create.mockResolvedValue({ user: { id: "u1" }, link_emailed: true, expires_at: EXPIRES });
    render(<CreateUserDialog onClose={() => {}} onCreated={() => {}} />);
    fill();
    expect(await screen.findByText(/emailed/i)).toBeTruthy();
    expect(screen.queryByLabelText(/set-password link/i)).toBeNull();
  });

  it("shows the one-time link with a warning and a working copy button", async () => {
    mocks.create.mockResolvedValue({ user: { id: "u1" }, link_emailed: false, reset_url: LINK, expires_at: EXPIRES });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<CreateUserDialog onClose={() => {}} onCreated={() => {}} />);
    fill();
    const field = (await screen.findByLabelText(/set-password link/i)) as HTMLInputElement;
    expect(field.value).toBe(LINK);
    expect(screen.getByText(/only time the link is shown/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK));
  });

  it("shows the backend error and keeps the form for another try", async () => {
    mocks.create.mockRejectedValue(
      new ApiError({ status: 409, code: "conflict", message: "username or email already taken" }),
    );
    render(<CreateUserDialog onClose={() => {}} onCreated={() => {}} />);
    fill();
    expect((await screen.findByRole("alert")).textContent).toContain("already taken");
    expect(screen.getByRole("button", { name: /^create user$/i })).toBeTruthy();
  });
});
