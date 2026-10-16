import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  instance: vi.fn(),
  form: vi.fn<(props: Record<string, unknown>) => null>(() => null),
}));
vi.mock("@/lib/instance-config.server", () => ({ getInstanceConfig: mocks.instance }));
vi.mock("@/components/auth/LoginForm", () => ({ LoginForm: mocks.form }));
vi.mock("@/components/OwnerClaimCard", () => ({ OwnerClaimCard: () => null }));
vi.mock("@/components/auth/AuthPage", () => ({ AuthPage: ({ children }: { children: React.ReactNode }) => children }));

import LoginPage from "./page";

describe("login provider server snapshot", () => {
  it("hands the instance labels to the client form on the first render", async () => {
    const details = [{ name: "corp", display_name: "Company SSO" }];
    mocks.instance.mockResolvedValue({ oauth_providers: ["corp"], oauth_provider_details: details });
    renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(mocks.form.mock.calls[0]?.[0]).toMatchObject({ initialProviderDetails: details });
  });
});
