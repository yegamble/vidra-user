// @vitest-environment jsdom
//
// The standalone account-entry chrome (login / signup / reset / verify / claim)
// is the single most visible "Powered by Vidra" surface in the product, and its
// wordmark falls back to the software's name when the instance has none. Both
// are gated on branding.hide_software_name; both states are pinned here.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { SoftwareBrandProvider } from "@/components/SoftwareBrandProvider";

import { AuthPage, AuthPageHeading, AuthPoweredBy } from "./AuthPage";

function renderIn(hidden: boolean, node: React.ReactNode) {
  return render(<SoftwareBrandProvider hidden={hidden}>{node}</SoftwareBrandProvider>);
}

afterEach(cleanup);

describe("AuthPoweredBy", () => {
  it("attributes the software by default (no provider at all)", () => {
    render(<AuthPoweredBy />);
    expect(screen.getByText("Powered by Vidra")).toBeTruthy();
  });

  it("renders the attribution while the software name is shown", () => {
    renderIn(false, <AuthPoweredBy />);
    expect(screen.getByText("Powered by Vidra")).toBeTruthy();
  });

  it("renders NOTHING when the software name is hidden", () => {
    // Not neutralized wording — the line IS the attribution, so it goes.
    const { container } = renderIn(true, <AuthPoweredBy />);
    expect(container.textContent).toBe("");
    expect(screen.queryByText(/powered by/i)).toBeNull();
  });
});

describe("AuthPage while white-labelled", () => {
  it("drops the Powered by line from the page chrome", () => {
    renderIn(
      true,
      <AuthPage>
        <AuthPageHeading title="Reset your password" instanceName="A17 Lab Tube" />
      </AuthPage>,
    );
    // The pinned heading and the one home link survive untouched…
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "A17 Lab Tube" }).getAttribute("href")).toBe("/");
    // …and nothing on the screen names the software.
    expect(screen.queryByText(/powered by/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/vidra/i);
  });

  it("keeps the Powered by line and the software wordmark fallback otherwise", () => {
    renderIn(
      false,
      <AuthPage>
        <AuthPageHeading title="Reset your password" />
      </AuthPage>,
    );
    expect(screen.getByText("Powered by Vidra")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Vidra" })).toBeTruthy();
  });

  it("falls back to a neutral home label when hidden and the instance is unnamed", () => {
    // The wordmark is the auth routes' ONLY main link (apple-ux.spec pins the
    // count), so it must never lose its accessible name.
    renderIn(true, <AuthPageHeading title="Verify your email" instanceName="  " />);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    expect(document.body.textContent).not.toMatch(/vidra/i);
  });
});
