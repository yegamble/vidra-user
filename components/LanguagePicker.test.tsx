// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguagePicker } from "./LanguagePicker";
import { I18nProvider } from "./I18nProvider";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function clearCookie() {
  document.cookie = "vidra_locale=; path=/; max-age=0";
}
beforeEach(() => {
  clearCookie();
  refresh.mockClear();
});
afterEach(cleanup);

describe("LanguagePicker", () => {
  it("lists Automatic and every locale, marking the incomplete one partial", () => {
    render(<LanguagePicker />);
    const labels = screen.getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(["Automatic", "English", "Français (partial)"]);
  });

  it("selecting a locale writes the cookie and refreshes", () => {
    const set = vi.spyOn(document, "cookie", "set");
    render(<LanguagePicker />);
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "fr" } });
    expect(set).toHaveBeenCalledWith("vidra_locale=fr; path=/; max-age=31536000; SameSite=Lax");
    expect(refresh).toHaveBeenCalledTimes(1);
    set.mockRestore();
  });

  it("Automatic clears the cookie and refreshes", () => {
    document.cookie = "vidra_locale=fr; path=/";
    const set = vi.spyOn(document, "cookie", "set");
    render(
      <I18nProvider locale="fr" messages={{}}>
        <LanguagePicker />
      </I18nProvider>,
    );
    expect((screen.getByLabelText("Language") as HTMLSelectElement).value).toBe("fr");
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "auto" } });
    expect(set).toHaveBeenCalledWith("vidra_locale=; path=/; max-age=0; SameSite=Lax");
    expect(refresh).toHaveBeenCalledTimes(1);
    set.mockRestore();
  });

  it("shows Automatic when no cookie is set, even if the locale resolved to en", () => {
    render(<LanguagePicker />);
    expect((screen.getByLabelText("Language") as HTMLSelectElement).value).toBe("auto");
  });
});
