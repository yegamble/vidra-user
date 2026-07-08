// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PasswordManager } from "./PasswordManager";
import { ApiError, api } from "@/lib/api";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

const now = new Date().toISOString();

describe("PasswordManager", () => {
  it("lists existing passwords and reports the count up", async () => {
    vi.spyOn(api, "listVideoPasswords").mockResolvedValue({
      passwords: [
        { id: "p1", created_at: now },
        { id: "p2", created_at: now },
      ],
    });
    const onCountChange = vi.fn();
    render(<PasswordManager videoId="v1" onCountChange={onCountChange} />);

    expect(await screen.findByText("Password 1")).toBeTruthy();
    expect(screen.getByText("Password 2")).toBeTruthy();
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));
  });

  it("reports zero and warns when a password-protected video has none", async () => {
    vi.spyOn(api, "listVideoPasswords").mockResolvedValue({ passwords: [] });
    const onCountChange = vi.fn();
    render(<PasswordManager videoId="v1" onCountChange={onCountChange} />);

    expect(await screen.findByText(/No passwords yet/)).toBeTruthy();
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(0));
  });

  it("adds a password (6+ chars) and appends it to the list", async () => {
    vi.spyOn(api, "listVideoPasswords").mockResolvedValue({ passwords: [] });
    const add = vi
      .spyOn(api, "addVideoPassword")
      .mockResolvedValue({ id: "p1", created_at: now });
    render(<PasswordManager videoId="v1" />);
    await screen.findByText(/No passwords yet/);

    const field = screen.getByLabelText("New password");
    // Too short → the Add button stays disabled.
    fireEvent.change(field, { target: { value: "abc" } });
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/at least 6 characters/)).toBeTruthy();

    fireEvent.change(field, { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(add).toHaveBeenCalledWith("v1", "longenough"));
    expect(await screen.findByText("Password 1")).toBeTruthy();
  });

  it("surfaces the 409 when deleting the last password", async () => {
    vi.spyOn(api, "listVideoPasswords").mockResolvedValue({
      passwords: [{ id: "p1", created_at: now }],
    });
    vi.spyOn(api, "deleteVideoPassword").mockRejectedValue(
      new ApiError({ status: 409, code: "conflict", message: "last password" }),
    );
    render(<PasswordManager videoId="v1" />);
    await screen.findByText("Password 1");

    fireEvent.click(screen.getByRole("button", { name: "Remove password 1" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("last password");
    // The password remains listed (delete was refused).
    expect(screen.getByText("Password 1")).toBeTruthy();
  });
});
