import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  acceptLanguage: null as string | null,
  instance: null as { default_language?: string } | null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "vidra_locale" && mocks.cookie !== undefined ? { name, value: mocks.cookie } : undefined,
  }),
  headers: async () =>
    new Headers(mocks.acceptLanguage ? { "accept-language": mocks.acceptLanguage } : {}),
}));
vi.mock("@/lib/instance-config.server", () => ({
  getInstanceConfig: async () => mocks.instance,
}));

import { getI18n } from "./locale.server";

beforeEach(() => {
  mocks.cookie = undefined;
  mocks.acceptLanguage = null;
  mocks.instance = null;
});

describe("getI18n", () => {
  it("is en with no request signal at all (and no backend)", async () => {
    const { locale, messages, t } = await getI18n();
    expect(locale).toBe("en");
    // en is the built-in fallback; an en request ships no extra catalog.
    expect(messages).toEqual({});
    expect(t("common.close")).toBe("Close");
  });

  it("honours the vidra_locale cookie and translates with that catalog", async () => {
    mocks.cookie = "fr";
    mocks.acceptLanguage = "en-US";
    const { locale, messages, t } = await getI18n();
    expect(locale).toBe("fr");
    expect(messages["common.close"]).toBe("Fermer");
    expect(t("common.close")).toBe("Fermer");
  });

  it("negotiates Accept-Language against complete catalogs only", async () => {
    mocks.acceptLanguage = "fr-FR,fr;q=0.9";
    expect((await getI18n()).locale).toBe("en");
  });

  it("ignores an unsupported cookie value instead of failing", async () => {
    mocks.cookie = "xx-invalid";
    expect((await getI18n()).locale).toBe("en");
  });
});
