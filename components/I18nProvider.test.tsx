// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import RouteError from "@/app/error";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Spinner } from "@/components/ui";
import { fr } from "@/lib/i18n/fr";

import { I18nProvider, useFormat, useT } from "./I18nProvider";

afterEach(cleanup);

function Probe() {
  const t = useT();
  return (
    <p>
      {t("common.close")} / {t("common.cancel")}
    </p>
  );
}

describe("I18nProvider", () => {
  it("defaults to en outside a provider, so a bare component test keeps today's strings", () => {
    render(<Probe />);
    expect(screen.getByText("Close / Cancel")).toBeTruthy();
  });

  it("translates with the provided catalog and falls back to en per key", () => {
    render(
      <I18nProvider locale="fr" messages={{ "common.close": "Fermer" }}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText("Fermer / Cancel")).toBeTruthy();
  });

  it("reaches the shared primitives (Spinner's default label)", () => {
    render(
      <I18nProvider locale="fr" messages={{ "common.loading": "Chargement" }}>
        <Spinner />
      </I18nProvider>,
    );
    expect(screen.getByRole("status", { name: "Chargement" })).toBeTruthy();
  });

  // Review finding on #301: with vidra_locale=fr the Modal said "Fermer" while
  // feature components on the English-only t() still said "Cancel". Every
  // externalized string must follow the provider, or none of them should.
  it("reaches the feature call sites too, not just the primitives", () => {
    render(
      <I18nProvider locale="fr" messages={fr}>
        <ThemeToggle />
        <RouteError error={new Error("boom")} reset={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByText("Apparence")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Une erreur est survenue" })).toBeTruthy();
  });

  it("useFormat follows the provider's locale and defaults to en", () => {
    function Count() {
      return <p>{useFormat().formatCount(1234)}</p>;
    }
    render(<Count />);
    expect(screen.getByText("1.2K")).toBeTruthy();
    cleanup();
    render(
      <I18nProvider locale="fr" messages={{}}>
        <Count />
      </I18nProvider>,
    );
    expect(screen.getByText(/^1,2\s?k$/)).toBeTruthy();
  });
});
