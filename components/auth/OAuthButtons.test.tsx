// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/I18nProvider";
import { LoginForm } from "@/components/auth/LoginForm";
import { oauthErrorMessage } from "@/components/auth/OAuthButtons";
import { SignupForm } from "@/components/auth/SignupForm";
import { fr } from "@/lib/i18n/fr";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: "anon" }),
}));
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: { getInstance: () => Promise.resolve({ registration_enabled: true }) },
}));

afterEach(cleanup);

// The callback's ?oauth_error=<code> is the only thing a refused provider
// sign-in leaves behind, so every code core can emit needs copy that says what
// happened AND what the person can do. A code with no case falls through to a
// generic "try again", which is wrong twice over for a policy refusal: trying
// again cannot work, and the reason is not a failure.
describe("oauthErrorMessage", () => {
  it("offers password sign-in when provider login is not configured", () => {
    const message = oauthErrorMessage("oauth_not_configured");
    expect(message).toMatch(/provider sign-in is not enabled/i);
    expect(message).toMatch(/password|administrator/i);
    expect(message).not.toMatch(/try again/i);
  });

  it("explains an incomplete provider exchange without claiming a session", () => {
    const message = oauthErrorMessage("oauth_exchange_failed");
    expect(message).toMatch(/did not complete/i);
    expect(message).toMatch(/no sign-in session/i);
    expect(message).toMatch(/start sign-in again|password/i);
  });

  it("explains provider sign-in is limited to existing connected accounts", () => {
    const message = oauthErrorMessage("signup_disabled");
    expect(message).toMatch(/already connected/i);
    expect(message).toMatch(/cannot create a new account/i);
    expect(message).toMatch(/sign in with your existing account/i);
    expect(message).toMatch(/Settings › Connected logins/);
    expect(message).not.toMatch(/try again/i);
  });

  it("explains the verified-email domain requirement for new accounts", () => {
    const message = oauthErrorMessage("email_domain_not_allowed");
    expect(message).toMatch(/new accounts/i);
    expect(message).toMatch(/verified email address/i);
    expect(message).toMatch(/domain allowed by this server/i);
    expect(message).not.toMatch(/try again/i);
  });

  it("explains a signup refused because registration is closed", () => {
    const message = oauthErrorMessage("registration_closed");
    expect(message).not.toBe(oauthErrorMessage("some_code_that_does_not_exist"));
    expect(message).toMatch(/not (accepting|taking) new accounts|registration is closed|closed/i);
    // Never tell someone to retry something the policy forbids.
    expect(message).not.toMatch(/try again/i);
  });

  it("explains a signup queued for approval, and that no retry is needed", () => {
    const message = oauthErrorMessage("registration_pending");
    expect(message).not.toBe(oauthErrorMessage("some_code_that_does_not_exist"));
    expect(message).toMatch(/review|approv/i);
    expect(message).not.toMatch(/try again/i);
  });
});

describe.each([
  { name: "LoginForm", Form: LoginForm },
  { name: "SignupForm", Form: SignupForm },
])("$name provider signup policy", ({ Form }) => {
  it.each([
    ["signup_disabled", /already connected/i, /comptes déjà associés/i],
    ["email_domain_not_allowed", /domain allowed by this server/i, /domaine autorisé par ce serveur/i],
    ["oauth_not_configured", /provider sign-in is not enabled/i, /pas activée sur ce serveur/i],
    ["oauth_exchange_failed", /no sign-in session/i, /aucune session/i],
  ])("renders %s with the active locale", async (code, english, french) => {
    const view = render(<Form oauthError={code} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(english);
    view.unmount();

    render(<I18nProvider locale="fr" messages={fr}><Form oauthError={code} /></I18nProvider>);
    expect((await screen.findByRole("alert")).textContent).toMatch(french);
  });
});
