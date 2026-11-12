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

import { ApiError } from "@/lib/api";
import { OWNER_CLAIM_FROM_SIGNUP, OWNER_CLAIM_REQUIRED_CODE } from "@/lib/owner-claim";

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
    // The way out if the message never arrives. Without it this screen was a
    // dead end: no session is issued behind the gate, so the signed-in resend
    // is unreachable to exactly the person looking at it.
    expect(screen.getByRole("button", { name: "Resend verification email" })).toBeTruthy();
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

  it("sends a signup refused for want of an owner to the wizard, button released", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc());
    registerMock.mockRejectedValue(
      new ApiError({
        status: 403,
        code: OWNER_CLAIM_REQUIRED_CODE,
        message: "instance is awaiting its owner",
      }),
    );
    render(<SignupForm />);

    await fillCoreFields();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith(OWNER_CLAIM_FROM_SIGNUP));
    // The redirect is the outcome, but it can be a no-op — the form has to be
    // usable afterwards rather than stuck on a disabled "Creating account…".
    const button = await screen.findByRole("button", { name: "Create account" });
    expect(button.hasAttribute("disabled")).toBe(false);
    // Not the applicant's mistake: no error banner over a form that cannot win.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// The consent record (D15): a signup accepts the instance's documents, the form
// never ticks for the person, and what they accepted is what the server records.
describe("SignupForm (terms and privacy policy)", () => {
  const documents = {
    terms_url: "https://example.test/terms",
    terms_version: "2026-11-12",
    privacy_url: "https://example.test/privacy",
    privacy_version: "",
  };

  it("shows an unticked checkbox with a live link to each configured document", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc(documents));
    render(<SignupForm />);

    const box = (await screen.findByRole("checkbox", { name: /I accept the/ })) as HTMLInputElement;
    expect(box.checked).toBe(false);
    const terms = screen.getByRole("link", { name: "terms of service" });
    expect(terms.getAttribute("href")).toBe("https://example.test/terms");
    expect(terms.getAttribute("target")).toBe("_blank");
    expect(terms.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: "privacy policy" }).getAttribute("href")).toBe("https://example.test/privacy");
    // The operator's version label is shown where there is one.
    expect(screen.getByText(/version 2026-11-12/)).toBeTruthy();
  });

  it("links only the document that is configured", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc({ privacy_url: "https://example.test/privacy" }));
    render(<SignupForm />);
    await screen.findByRole("checkbox", { name: /I accept the/ });
    expect(screen.getByRole("link", { name: "privacy policy" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "terms of service" })).toBeNull();
  });

  it("renders no checkbox and sends no acceptance when nothing is configured", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc());
    registerMock.mockResolvedValue("created");
    render(<SignupForm />);
    await fillCoreFields();
    expect(screen.queryByRole("checkbox", { name: /I accept the/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(registerMock).toHaveBeenCalled());
    expect(registerMock.mock.calls[0][0].terms_accepted).toBeUndefined();
  });

  it("submits the tick as the person left it", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc(documents));
    registerMock.mockResolvedValue("created");
    render(<SignupForm />);
    const box = await screen.findByRole("checkbox", { name: /I accept the/ });
    await fillCoreFields();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(registerMock).toHaveBeenCalled());
    expect(registerMock.mock.calls[0][0]).toMatchObject({ terms_accepted: true });
  });

  it("shows the server's refusal on the checkbox when it was left unticked", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc(documents));
    registerMock.mockRejectedValue(new ApiError({
      status: 422, code: "validation_failed", message: "validation failed",
      fields: [{ field: "terms_accepted", message: "you must accept the terms of service and the privacy policy to create an account" }],
    }));
    render(<SignupForm />);
    const box = await screen.findByRole("checkbox", { name: /I accept the/ });
    await fillCoreFields();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(registerMock).toHaveBeenCalled());
    expect(registerMock.mock.calls[0][0]).toMatchObject({ terms_accepted: false });
    expect(await screen.findByText(/you must accept the terms of service/)).toBeTruthy();
    expect(box.getAttribute("aria-invalid")).toBe("true");
  });

  it("carries the tick on the provider buttons, and only once it is ticked", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc({ ...documents, oauth_providers: ["google"] }));
    render(<SignupForm />);
    const box = await screen.findByRole("checkbox", { name: /I accept the/ });
    const provider = () => screen.getByRole("link", { name: "Continue with Google" }).getAttribute("href") ?? "";
    expect(provider()).not.toContain("terms_accepted");
    fireEvent.click(box);
    expect(provider()).toContain("terms_accepted=1");
  });

  it("explains a provider sign-up refused for want of the acceptance", async () => {
    getInstanceMock.mockResolvedValue(instanceDoc(documents));
    render(<SignupForm oauthError="terms_required" />);
    expect(await screen.findByText(/accept the terms of service and the privacy policy below/i)).toBeTruthy();
  });
});
