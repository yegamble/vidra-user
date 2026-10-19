// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PasswordManager } from "./PasswordManager";
import { ApiError, api } from "@/lib/api";
import { I18nProvider } from "@/components/I18nProvider";
import { fr } from "@/lib/i18n/fr";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

const now = new Date().toISOString();

describe("PasswordManager", () => {
  it("renders recovery controls in French", async () => {
    vi.spyOn(api, "listVideoPasswords").mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ passwords: [] });
    render(<I18nProvider locale="fr" messages={fr}><PasswordManager videoId="v1" /></I18nProvider>);
    expect((await screen.findByRole("alert")).textContent).toContain("Impossible de charger les mots de passe");
    expect((screen.getByLabelText("Nouveau mot de passe") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: fr["common.retry"] }));
    expect(await screen.findByText(/Aucun mot de passe/)).toBeTruthy();
  });

  it("keeps a failed list unknown, guards mutations, and retries the actual list", async () => {
    const list = vi.spyOn(api, "listVideoPasswords")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ passwords: [{ id: "p1", created_at: now }] });
    const add = vi.spyOn(api, "addVideoPassword");
    const onCountChange = vi.fn();
    render(<PasswordManager videoId="v1" onCountChange={onCountChange} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/No passwords yet/)).toBeNull();
    expect(onCountChange).not.toHaveBeenCalledWith(0);
    expect(onCountChange).toHaveBeenLastCalledWith(null);
    expect((screen.getByLabelText("New password") as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(add).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Password 1")).toBeTruthy();
    expect(list).toHaveBeenCalledTimes(2);
    expect(onCountChange).toHaveBeenLastCalledWith(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("aborts stale video loads without leaking their count or passwords", async () => {
    let resolveOld!: (value: { passwords: { id: string; created_at: string }[] }) => void;
    const list = vi.spyOn(api, "listVideoPasswords")
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ passwords: [] });
    const onCountChange = vi.fn();
    const view = render(<PasswordManager videoId="old" onCountChange={onCountChange} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(onCountChange).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    const oldSignal = list.mock.calls[0][1];
    view.rerender(<PasswordManager videoId="new" onCountChange={onCountChange} />);
    expect(oldSignal?.aborted).toBe(true);
    await screen.findByText(/No passwords yet/);
    await act(async () => { resolveOld({ passwords: [{ id: "stale", created_at: now }] }); });
    expect(screen.queryByText("Password 1")).toBeNull();
    expect(onCountChange).toHaveBeenLastCalledWith(0);
    expect(onCountChange).not.toHaveBeenCalledWith(1);
  });

  it("clears a previous zero count when remounted and the next load fails", async () => {
    vi.spyOn(api, "listVideoPasswords")
      .mockResolvedValueOnce({ passwords: [] })
      .mockRejectedValueOnce(new Error("offline"));
    const onCountChange = vi.fn();
    const first = render(<PasswordManager videoId="v1" onCountChange={onCountChange} />);
    await screen.findByText(/No passwords yet/);
    expect(onCountChange).toHaveBeenLastCalledWith(0);
    first.unmount();
    onCountChange.mockClear();
    render(<PasswordManager videoId="v1" onCountChange={onCountChange} />);
    await screen.findByRole("alert");
    expect(onCountChange).toHaveBeenLastCalledWith(null);
    expect(onCountChange).not.toHaveBeenCalledWith(0);
  });

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
