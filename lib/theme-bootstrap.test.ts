import { describe, expect, it } from "vitest";

import {
  THEME_BOOTSTRAP_SCRIPT,
  THEME_STORAGE_KEY,
  buildThemeBootstrapScript,
} from "./theme-bootstrap";

// The pre-paint bootstrap is an inline script string; these tests execute it
// against a stubbed DOM/localStorage to pin its semantics: a stored
// "light"/"dark" preference always wins, the instance default (SSR snapshot)
// only fills the gap, and anything else follows the OS (no data-theme).

function run(script: string, stored: string | null): string | undefined {
  const documentElement: { dataset: Record<string, string> } = { dataset: {} };
  const fn = new Function(
    "localStorage",
    "document",
    script,
  ) as (ls: { getItem(key: string): string | null }, doc: unknown) => void;
  fn({ getItem: (key) => (key === THEME_STORAGE_KEY ? stored : null) }, { documentElement });
  return documentElement.dataset.theme;
}

describe("buildThemeBootstrapScript", () => {
  it("with no instance default behaves exactly like the legacy bootstrap", () => {
    expect(buildThemeBootstrapScript()).toBe(THEME_BOOTSTRAP_SCRIPT);
    expect(run(THEME_BOOTSTRAP_SCRIPT, "dark")).toBe("dark");
    expect(run(THEME_BOOTSTRAP_SCRIPT, "light")).toBe("light");
    expect(run(THEME_BOOTSTRAP_SCRIPT, null)).toBeUndefined();
    expect(run(THEME_BOOTSTRAP_SCRIPT, "purple")).toBeUndefined();
  });

  it("applies the instance default only when the visitor has no stored preference", () => {
    const script = buildThemeBootstrapScript("dark");
    expect(run(script, null)).toBe("dark");
    expect(run(script, "light")).toBe("light");
    expect(run(script, "garbage")).toBe("dark");
  });

  it("honours an explicit stored 'system' choice over the instance default", () => {
    // writeThemePreference persists "system" explicitly (W5): the visitor
    // chose to follow their OS, so the instance default must NOT re-apply.
    expect(run(buildThemeBootstrapScript("dark"), "system")).toBeUndefined();
    expect(run(buildThemeBootstrapScript("light"), "system")).toBeUndefined();
    expect(run(THEME_BOOTSTRAP_SCRIPT, "system")).toBeUndefined();
  });

  it("treats system/unknown instance defaults as follow-the-OS", () => {
    expect(run(buildThemeBootstrapScript("system"), null)).toBeUndefined();
    expect(run(buildThemeBootstrapScript("blue"), null)).toBeUndefined();
    expect(run(buildThemeBootstrapScript(undefined), null)).toBeUndefined();
  });

  it("never throws when storage is unavailable", () => {
    const documentElement: { dataset: Record<string, string> } = { dataset: {} };
    const fn = new Function("localStorage", "document", buildThemeBootstrapScript("dark")) as (
      ls: unknown,
      doc: unknown,
    ) => void;
    expect(() =>
      fn(
        {
          getItem: () => {
            throw new Error("denied");
          },
        },
        { documentElement },
      ),
    ).not.toThrow();
  });
});
