// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getEmailChange = vi.fn();
const requestEmailChange = vi.fn();
const resendEmailChange = vi.fn();
const cancelEmailChange = vi.fn();

vi.mock("@/lib/api", () => ({
  authApi: {
    getEmailChange: (...args: unknown[]) => getEmailChange(...args),
    requestEmailChange: (...args: unknown[]) => requestEmailChange(...args),
    resendEmailChange: (...args: unknown[]) => resendEmailChange(...args),
    cancelEmailChange: (...args: unknown[]) => cancelEmailChange(...args),
  },
  // Mirrors the real ApiError's constructor shape so the component's
  // `instanceof` + `.status` branches run exactly as they do in production
  // (tsc type-checks against the real class, not this stand-in).
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

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: { email: "ada@example.test", email_verified: true } }),
}));

import { ApiError } from "@/lib/api";

import { ChangeEmailSection } from "./ChangeEmailSection";

const NEW_EMAIL = "New email address";
const PASSWORD = "Current password";
const SUBMIT = "Send confirmation";

function apiError(status: number, message: string) {
  return new ApiError({ status, code: "err", message });
}

beforeEach(() => {
  getEmailChange.mockResolvedValue({ pending: false });
  requestEmailChange.mockResolvedValue({ pending: true, new_email: "ada.new@example.test" });
  resendEmailChange.mockResolvedValue({ pending: true, new_email: "ada.new@example.test" });
  cancelEmailChange.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChangeEmailSection", () => {
  it("shows the current address and asks for the new one plus the password", async () => {
    render(<ChangeEmailSection />);
    await waitFor(() => expect(getEmailChange).toHaveBeenCalled());
    expect(screen.getByText("ada@example.test")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(NEW_EMAIL), {
      target: { value: "ada.new@example.test" },
    });
    fireEvent.change(screen.getByLabelText(PASSWORD), { target: { value: "pw-fixture-alice" } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() =>
      expect(requestEmailChange).toHaveBeenCalledWith({
        current_password: "pw-fixture-alice",
        new_email: "ada.new@example.test",
      }),
    );
    // The success state must say the address has NOT changed yet — the whole
    // point of the two-step flow is that asking does nothing on its own.
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/ada\.new@example\.test/);
    // ...and the card switches to the pending state, so the password field is gone.
    await waitFor(() => expect(screen.queryByLabelText(PASSWORD)).toBeNull());
    expect(screen.getByRole("button", { name: "Cancel change" })).toBeTruthy();
  });

  it("cannot be submitted until both fields are filled", async () => {
    render(<ChangeEmailSection />);
    await waitFor(() => expect(getEmailChange).toHaveBeenCalled());
    const submit = screen.getByRole("button", { name: SUBMIT }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(NEW_EMAIL), { target: { value: "a@b.test" } });
    expect((screen.getByRole("button", { name: SUBMIT }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(PASSWORD), { target: { value: "pw-fixture-alice" } });
    expect((screen.getByRole("button", { name: SUBMIT }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders the pending state with resend and cancel, and cancel returns the form", async () => {
    getEmailChange.mockResolvedValue({
      pending: true,
      new_email: "ada.new@example.test",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    render(<ChangeEmailSection />);

    await screen.findByText("ada.new@example.test");
    // No form while a change is pending: the way out is resend or cancel.
    expect(screen.queryByLabelText(NEW_EMAIL)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Resend confirmation" }));
    await waitFor(() => expect(resendEmailChange).toHaveBeenCalled());
    expect((await screen.findByRole("status")).textContent).toMatch(/no longer works/i);

    fireEvent.click(screen.getByRole("button", { name: "Cancel change" }));
    await waitFor(() => expect(cancelEmailChange).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText(NEW_EMAIL)).toBeTruthy());
  });

  it("names the refusal: wrong password, taken address, and the password-less account", async () => {
    render(<ChangeEmailSection />);
    await waitFor(() => expect(getEmailChange).toHaveBeenCalled());

    const fill = () => {
      fireEvent.change(screen.getByLabelText(NEW_EMAIL), { target: { value: "ada.new@example.test" } });
      fireEvent.change(screen.getByLabelText(PASSWORD), { target: { value: "pw-fixture-alice" } });
      fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    };

    requestEmailChange.mockRejectedValueOnce(apiError(403, "incorrect password"));
    fill();
    expect((await screen.findByRole("alert")).textContent).toMatch(/not your current password/i);

    requestEmailChange.mockRejectedValueOnce(
      apiError(409, "that email address is already in use on this instance"),
    );
    fill();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/already in use/i),
    );

    // The other 409 is a different problem and must not read the same. It has
    // to point at a remedy the user can actually reach: the reset flow it used
    // to name can never complete for this account shape, because its address is
    // a generated one that cannot receive the mail (A30).
    requestEmailChange.mockRejectedValueOnce(
      apiError(
        409,
        "this account has no password: set one with POST /api/v1/auth/me/password/set, which confirms you by re-signing in with the provider this account uses",
      ),
    );
    fill();
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/signs in without a password/i);
      expect(alert.textContent).toMatch(/Finish securing your account/i);
      expect(alert.querySelector('a[href="/reset-password"]')).toBeNull();
    });
  });

  it("survives a failed pending read rather than blanking the card", async () => {
    getEmailChange.mockRejectedValue(apiError(500, "boom"));
    render(<ChangeEmailSection />);
    await waitFor(() => expect(screen.getByLabelText(NEW_EMAIL)).toBeTruthy());
    expect(screen.getByText("ada@example.test")).toBeTruthy();
  });
});

// A05: with no outbound mail path the API still answers 202 and parks a pending
// change whose confirmation nobody receives, so the card would read "waiting for
// confirmation at …" forever. It withholds the form and says why instead.
it("explains instead of offering the form when the instance cannot send mail", async () => {
  getEmailChange.mockResolvedValue({ pending: false });
  render(<ChangeEmailSection mailEnabled={false} />);

  await waitFor(() => {
    expect(screen.getByText(/cannot send email yet/i)).toBeTruthy();
  });
  expect(screen.queryByLabelText(NEW_EMAIL)).toBeNull();
  expect(requestEmailChange).not.toHaveBeenCalled();
  // The address itself is still shown: it is the fact the user came for.
  expect(screen.getByText("ada@example.test")).toBeTruthy();
});

// The prop above is a snapshot from an ISR page with a 60-second revalidate, so
// it can be a minute behind the deployment. When it is, the SERVER refuses —
// with a typed 503 whose message survives the central 5xx scrubber — and the
// card must repeat the operator's sentence rather than "something went wrong".
it("repeats the operator's sentence when the server refuses for want of mail", async () => {
  getEmailChange.mockResolvedValue({ pending: false });
  requestEmailChange.mockRejectedValue(
    new ApiError({
      status: 503,
      code: "mail_not_configured",
      message: "this instance has no outbound mail path…",
    }),
  );
  render(<ChangeEmailSection mailEnabled />);

  fireEvent.change(await screen.findByLabelText(NEW_EMAIL), {
    target: { value: "ada.new@example.test" },
  });
  fireEvent.change(screen.getByLabelText(PASSWORD), { target: { value: "supersecret" } });
  fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

  await waitFor(() => expect(screen.getByText(/cannot send email yet/i)).toBeTruthy());
  expect(screen.queryByText("Something went wrong.")).toBeNull();
});
