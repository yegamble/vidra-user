// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstance: vi.fn(),
  router: { replace: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "anon" }) }));
vi.mock("@/lib/api", async (importActual) => ({
  ...await importActual<typeof import("@/lib/api")>(),
  api: { getInstance: mocks.getInstance },
}));

import type { InstanceResponse } from "@/lib/api";
import { LoginForm } from "./LoginForm";
import { OAuthButtons } from "./OAuthButtons";
import { SignupForm } from "./SignupForm";

const details = [{ name: "corp", display_name: "Company SSO" }];
const instance = {
  registration_enabled: true,
  oauth_providers: ["corp"],
  oauth_provider_details: details,
} as InstanceResponse;

beforeEach(() => mocks.getInstance.mockReturnValue(new Promise(() => {})));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("OIDC provider button labels", () => {
  it("shows the configured label while keeping the provider slug in its link", () => {
    render(<OAuthButtons providers={["corp", "google"]} details={details} returnTo="/login?oauth=1" />);
    const link = screen.getByRole("link", { name: "Continue with Company SSO" });
    expect(new URL(link.getAttribute("href")!).pathname).toBe("/api/v1/auth/oauth/corp");
    expect(screen.getByRole("link", { name: "Continue with Google" })).toBeTruthy();
  });

  it("keeps legacy provider names when an older instance omits details", () => {
    render(<OAuthButtons providers={["google"]} returnTo="/login" />);
    expect(screen.getByRole("link", { name: "Continue with Google" })).toBeTruthy();
  });

  it("does not offer an inactive provider just because its label is present", () => {
    render(<OAuthButtons providers={[]} details={details} returnTo="/login" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("paints the login server snapshot before revalidation finishes", () => {
    render(<LoginForm initialProviders={["corp"]} initialProviderDetails={details} />);
    expect(screen.getByRole("link", { name: "Continue with Company SSO" })).toBeTruthy();
  });

  it("paints the signup server snapshot before revalidation finishes", () => {
    render(<SignupForm initialInstance={instance} />);
    expect(screen.getByRole("link", { name: "Continue with Company SSO" })).toBeTruthy();
  });

  it.each([
    { name: "LoginForm", Form: LoginForm },
    { name: "SignupForm", Form: SignupForm },
  ])("refreshes $name provider labels from the instance document", async ({ Form }) => {
    mocks.getInstance.mockResolvedValue(instance);
    render(<Form />);
    expect(await screen.findByRole("link", { name: "Continue with Company SSO" })).toBeTruthy();
  });
});
