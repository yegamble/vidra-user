// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const requestPasswordReset = vi.fn();

vi.mock("@/lib/api", () => ({
  authApi: {
    requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
  },
  errorMessage: () => "Something went wrong. Please try again.",
}));

import { ResetPasswordForm } from "./ResetPasswordForm";

afterEach(() => {
  cleanup();
  requestPasswordReset.mockReset();
});

// A05: with no outbound mail path the endpoint still answers 202 and still
// mints a token, so the success copy ("check your inbox") promised something
// nothing could deliver — on the one flow where a dead end costs the user their
// account. The form must explain instead, and must not collect the address.
it("explains instead of collecting an address when the instance cannot send mail", () => {
  render(<ResetPasswordForm mailEnabled={false} />);

  expect(screen.getByText(/cannot send email yet/i)).toBeTruthy();
  expect(screen.queryByLabelText(/^email$/i)).toBeNull();
  expect(screen.queryByRole("button", { name: /send reset link/i })).toBeNull();
  expect(requestPasswordReset).not.toHaveBeenCalled();
});

it("asks for the address and confirms neutrally when mail is configured", async () => {
  requestPasswordReset.mockResolvedValue(undefined);
  render(<ResetPasswordForm mailEnabled />);

  fireEvent.change(screen.getByLabelText(/^email$/i), {
    target: { value: "ada@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

  await waitFor(() => {
    expect(screen.getByText(/if an account exists for that email/i)).toBeTruthy();
  });
  expect(requestPasswordReset).toHaveBeenCalledWith({ email: "ada@example.test" });
});

// The default keeps an older backend that does not report features.mail — and
// the mocked e2e suite, which runs with no backend at all — on today's path.
it("defaults to offering the form when the flag is absent", () => {
  render(<ResetPasswordForm />);
  expect(screen.getByRole("button", { name: /send reset link/i })).toBeTruthy();
});
