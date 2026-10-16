import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { en, EN_NAMESPACES } from "./en";
import { fr, FR_NAMESPACES } from "./fr";
import { createTranslator, type Message } from "./index";
import { LOCALES } from "./locales";

const sortedKeys = (object: object) => Object.keys(object).sort();
const placeholders = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe("French catalog parity", () => {
  it("registers every English namespace and every French namespace file", () => {
    const files = readdirSync(path.join(__dirname, "fr"))
      .filter((name) => name.endsWith(".ts") && name !== "index.ts")
      .map((name) => name.slice(0, -3))
      .sort();
    expect(sortedKeys(FR_NAMESPACES)).toEqual(sortedKeys(EN_NAMESPACES));
    expect(sortedKeys(FR_NAMESPACES)).toEqual(files);
  });

  it("translates exactly the keys in each English namespace", () => {
    for (const [namespace, messages] of Object.entries(EN_NAMESPACES)) {
      const translated = FR_NAMESPACES[namespace as keyof typeof FR_NAMESPACES] ?? {};
      expect(sortedKeys(translated), namespace).toEqual(sortedKeys(messages));
    }
    expect(sortedKeys(fr)).toEqual(sortedKeys(en));
  });

  it("preserves message types and every placeholder in every translated form", () => {
    const frenchForms = new Intl.PluralRules("fr").resolvedOptions().pluralCategories;
    for (const [key, message] of Object.entries(fr)) {
      const source: Message = en[key as keyof typeof en];
      expect(typeof message, key).toBe(typeof source);
      const expected = placeholders(typeof source === "string" ? source : Object.values(source).join(" "));
      const forms = typeof message === "string" ? [message] : Object.values(message);
      for (const text of forms) expect(placeholders(text), key).toEqual(expected);
      if (typeof message !== "string") {
        expect(message, key).toHaveProperty("other");
        for (const form of sortedKeys(message)) expect(frenchForms, key).toContain(form);
      }
    }
  });

  it("renders French zero, singular, plural and million counts", () => {
    const t = createTranslator("fr", fr);
    expect(t("channel.followers", { count: 0 })).toBe("0 abonné");
    expect(t("channel.followers", { count: 1 })).toBe("1 abonné");
    expect(t("channel.followers", { count: 2 })).toBe("2 abonnés");
    expect(t("live.watch.viewers", { count: 1_000_000 })).toBe("1 000 000 spectateurs");
    expect(t("comments.replies.view", { count: 2 })).toBe("Voir 2 réponses");
  });

  it("keeps plain count labels grammatical at one", () => {
    const t = createTranslator("fr", fr);
    expect(t("watch.meta.views", { count: 1 })).toBe("Vues : 1");
    expect(t("watch.channel.followers", { count: 1 })).toBe("Abonnés : 1");
    expect(t("panels.playlist.videos", { total: 1 })).toBe("Vidéos : 1");
  });

  it("keeps automatic French selection off until native-speaker review", () => {
    expect(LOCALES.fr.complete).toBe(false);
  });
});
