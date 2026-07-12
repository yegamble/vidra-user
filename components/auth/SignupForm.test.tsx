// @vitest-environment jsdom
//
// SignupForm W7 states (config-parity Sign-up & new users): the age
// attestation checkbox, the verification-pending confirmation, the
// user-limit-reached closure copy, and the requires-verification note.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { routerReplace, routerPush, registerMock, getInstanceMock } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
  registerMock: vi.fn(),
  getInstanceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: "anon", register: registerMock }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { getInstance: getInstanceMock },
  };
});

import { SignupForm } from "./SignupForm";

// A minimal /instance document; tests override the W7 fields per case.
function instanceDoc(overrides: Record<string, unknown> = {}) {
  return {
    registration_enabled: true,
    registration_requires_approval: false,
    registration_requires_email_verification: false,
    registration_minimum_age: 0,
    registration_disabled_reason: "",
    oauth_providers: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  registerMock.mockReset();
  getInstanceMock.mockReset();
  routerPush.mockReset();
  routerReplace.mockReset();
});

async function fillCoreFields() {
  fireEvent.change(await screen.findByLabelText("Username"), { target: { value: "ada" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "supersecret" } });
}

describe("SignupForm (W7 sign-up policies)", () => {
  it("renders the age attestation and submits its state", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc({ registration_minimum_age: 16 }));
    registerMock.mockResolvedValue("created");
    render(<SignupForm />);

    const box = await screen.findByLabelText("I am at least 16 years old");
    await fillCoreFields();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(registerMock).toHaveBeenCalled());
    expect(registerMock.mock.calls[0][0]).toMatchObject({ age_attestation: true });
  });

  it("does not render the attestation while the setting is off", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc());
    render(<SignupForm />);
    await screen.findByLabelText("Username");
    expect(screen.queryByLabelText(/I am at least/)).toBeNull();
  });

  it("shows the check-your-email state on a verification_pending outcome", async () => {
    getInstanceMock.mockResolvedValue(
      instanceDoc({ registration_requires_email_verification: true }),
    );
    registerMock.mockResolvedValue("verification_pending");
    render(<SignupForm />);

    // The requires-verification note renders on the open form.
    await screen.findByText(/requires email verification/);

    await fillCoreFields();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await screen.findByText("Check your email");
    expect(screen.getByText(/verification link/)).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("explains a user-limit closure distinctly from a plain closure", async () => {
    getInstanceMock.mockResolvedValue(
      instanceDoc({
        registration_enabled: false,
        registration_disabled_reason: "user_limit_reached",
      }),
    );
    render(<SignupForm />);
    await screen.findByText("This instance is full");
    expect(screen.getByText(/maximum number of accounts/)).toBeTruthy();
  });

  it("keeps the generic copy for a plain closure", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc({ registration_enabled: false }));
    render(<SignupForm />);
    await screen.findByText("Registration is closed");
  });
});
