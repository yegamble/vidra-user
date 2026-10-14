// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOIDCProviders: vi.fn(),
  createOIDCProvider: vi.fn(),
  updateOIDCProvider: vi.fn(),
  deleteOIDCProvider: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, ...mocks } };
});

import { ApiError } from "@/lib/api";
import type { OIDCProviderList } from "@/lib/api";

import { OIDCProvidersPanel } from "./AdminOIDCProvidersView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const row = {
  name: "corp",
  display_name: "Corp SSO",
  issuer_url: "https://idp.example.com",
  client_id: "cid",
  scopes: [],
  enabled: true,
  auto_provision: true,
  allowed_email_domains: [],
  secret_configured: true,
  secret_status: "ok" as const,
  updated_at: "2026-10-01T00:00:00Z",
};
const list: OIDCProviderList = {
  providers: [row],
  environment: [{ name: "corp", issuer_url: "https://idp.example.com", overridden: true }],
  secrets_available: true,
};

async function open() {
  mocks.listOIDCProviders.mockResolvedValue(list);
  render(<OIDCProvidersPanel />);
  await screen.findByText("Corp SSO");
}
const password = (value: string) =>
  fireEvent.change(screen.getByLabelText("Confirm with your password"), { target: { value } });

describe("OIDCProvidersPanel", () => {
  it("lists providers and never shows a secret, only that one is configured", async () => {
    await open();
    expect(screen.getByText("Configured")).toBeTruthy();
    expect(screen.getByText(/replaced by the entry above/)).toBeTruthy();
  });

  it("editing without touching the secret omits it; the issuer is read-only", async () => {
    await open();
    mocks.updateOIDCProvider.mockResolvedValue(row);
    fireEvent.click(screen.getByRole("button", { name: "Edit provider corp" }));
    expect((screen.getByLabelText("Issuer URL") as HTMLInputElement).readOnly).toBe(true);
    password("pw");
    fireEvent.click(screen.getByRole("button", { name: "Save provider" }));
    await waitFor(() => expect(mocks.updateOIDCProvider).toHaveBeenCalled());
    const [name, body] = mocks.updateOIDCProvider.mock.calls[0];
    expect(name).toBe("corp");
    expect("client_secret" in body).toBe(false);
    expect("issuer_url" in body).toBe(false);
    expect(body.current_password).toBe("pw");
  });

  it("shows the server's issuer validation inline on create", async () => {
    await open();
    mocks.createOIDCProvider.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Invalid fields",
        fields: [{ field: "issuer_url", message: "must use the environment issuer" }],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add provider" }));
    fireEvent.change(screen.getByLabelText("Provider name"), { target: { value: "corp" } });
    password("pw");
    fireEvent.click(screen.getByRole("button", { name: "Save provider" }));
    expect(await screen.findAllByText(/must use the environment issuer/)).not.toHaveLength(0);
  });

  it("toggling asks for the password, then sends enabled=false", async () => {
    await open();
    mocks.updateOIDCProvider.mockResolvedValue({ ...row, enabled: false });
    fireEvent.click(screen.getByRole("switch", { name: "Enable sign-in with corp" }));
    password("pw");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(mocks.updateOIDCProvider).toHaveBeenCalled());
    expect(mocks.updateOIDCProvider.mock.calls[0][1]).toMatchObject({ enabled: false, current_password: "pw" });
  });

  it("delete surfaces the 422 'disable or edit instead' message", async () => {
    await open();
    mocks.deleteOIDCProvider.mockRejectedValue(
      new ApiError({ status: 422, code: "validation_failed", message: "Disable or edit it instead." }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete provider corp" }));
    password("pw");
    fireEvent.click(screen.getByRole("button", { name: "Delete provider" }));
    expect(await screen.findByText("Disable or edit it instead.")).toBeTruthy();
    expect(mocks.deleteOIDCProvider).toHaveBeenCalledWith("corp", { current_password: "pw" });
  });

  it("a 429 reads as an inline rate-limit error", async () => {
    await open();
    mocks.deleteOIDCProvider.mockRejectedValue(new ApiError({ status: 429, code: "rate_limited", message: "x" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete provider corp" }));
    password("pw");
    fireEvent.click(screen.getByRole("button", { name: "Delete provider" }));
    expect(await screen.findByText(/Too many password attempts/)).toBeTruthy();
  });
});
