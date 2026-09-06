// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changePassword = vi.fn();
vi.mock("@/lib/api", () => ({
  authApi: { changePassword: (...args: unknown[]) => changePassword(...args) },
  // Mirrors the real ApiError's constructor shape so the component's
  // `instanceof` + `.status` branches are exercised exactly as they are in
  // production (tsc type-checks against the real class, not this stand-in).
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(args: { status: number; code: string; message: string }) {
      super(args.message);
      this.status = args.status;
      this.code = args.code;
    }
  },
  errorMessage: () => "Something went wrong.",
}));

import { ApiError } from "@/lib/api";

import { ChangePasswordSection } from "./ChangePasswordSection";

const CURRENT = "Current password";
const NEW = "New password";
const CONFIRM = "Confirm new password";
const SUBMIT = "Change password";

function fill(values: { current?: string; next?: string; confirm?: string }) {
  if (values.current !== undefined) {
    fireEvent.change(screen.getByLabelText(CURRENT), { target: { value: values.current } });
  }
  if (values.next !== undefined) {
    fireEvent.change(screen.getByLabelText(NEW), { target: { value: values.next } });
  }
  if (values.confirm !== undefined) {
    fireEvent.change(screen.getByLabelText(CONFIRM), { target: { value: values.confirm } });
  }
}

beforeEach(() => {
  changePassword.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChangePasswordSection", () => {
  it("sends the current and new password and says the other devices were signed out", async () => {
    render(<ChangePasswordSection />);
    fill({ current: "supersecret", next: "evenmoresecret", confirm: "evenmoresecret" });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        current_password: "supersecret",
        new_password: "evenmoresecret",
      }),
    );
    // The success state must state the consequence: other devices are out.
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/signed out/i);
    // And it must not leave the typed passwords sitting in the form.
    expect((screen.getByLabelText(CURRENT) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(NEW) as HTMLInputElement).value).toBe("");
  });

  it("refuses a mismatched confirmation without calling the API", async () => {
    render(<ChangePasswordSection />);
    fill({ current: "supersecret", next: "evenmoresecret", confirm: "evenmoresecrat" });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("names the wrong current password rather than a generic failure", async () => {
    changePassword.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "incorrect password" }));
    render(<ChangePasswordSection />);
    fill({ current: "wrong", next: "evenmoresecret", confirm: "evenmoresecret" });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/current password/i);
    // A failure must not claim anything was signed out.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("points a password-less (OAuth-only) account at the reset flow on 409", async () => {
    changePassword.mockRejectedValue(new ApiError({ status: 409, code: "conflict", message: "no password set" }));
    render(<ChangePasswordSection />);
    fill({ current: "supersecret", next: "evenmoresecret", confirm: "evenmoresecret" });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/reset/i);
    expect(screen.getByRole("link", { name: /reset/i }).getAttribute("href")).toBe("/reset-password");
  });

  it("surfaces the policy failure from the API on 422", async () => {
    changePassword.mockRejectedValue(new ApiError({ status: 422, code: "validation_failed", message: "too short" }));
    render(<ChangePasswordSection />);
    fill({ current: "supersecret", next: "evenmoresecret", confirm: "evenmoresecret" });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
  });

  it("is a named region, so its Current password field is distinguishable from two-factor's", () => {
    render(<ChangePasswordSection />);
    // When two-factor is on, /settings/security carries a SECOND, correctly
    // labelled "Current password" input. The region name is what tells a screen
    // reader (and a test) which one it is on.
    expect(screen.getByRole("region", { name: "Password" })).toBeTruthy();
  });

  it("labels every field and marks the inputs as passwords for password managers", () => {
    render(<ChangePasswordSection />);
    const current = screen.getByLabelText(CURRENT) as HTMLInputElement;
    const next = screen.getByLabelText(NEW) as HTMLInputElement;
    const confirm = screen.getByLabelText(CONFIRM) as HTMLInputElement;
    expect([current.type, next.type, confirm.type]).toEqual(["password", "password", "password"]);
    expect(current.autocomplete).toBe("current-password");
    expect(next.autocomplete).toBe("new-password");
    expect(confirm.autocomplete).toBe("new-password");
  });
});
