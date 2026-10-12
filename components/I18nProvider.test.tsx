// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Spinner } from "@/components/ui";

import { I18nProvider, useT } from "./I18nProvider";

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
});
