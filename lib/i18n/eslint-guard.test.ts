import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The English-only translator is gone and createTranslator is the provider's
// building block, so app/ and components/ may not import either from the i18n
// seam: they use useT() (client) or getI18n() (server), which follow the
// viewer's locale. This lints real snippets through the repo's ESLint config.
const eslint = new ESLint({ cwd: path.resolve(__dirname, "../..") });

async function restricted(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
}

describe("i18n import guard", () => {
  it("rejects the bare translator in app/ and components/", async () => {
    const code = 'import { createTranslator } from "@/lib/i18n";\nexport const x = createTranslator;\n';
    expect(await restricted(code, "components/Foo.tsx")).toHaveLength(1);
    expect(await restricted(code, "app/foo/page.tsx")).toHaveLength(1);
    expect(await restricted('import { t } from "@/lib/i18n";\nexport const x = t;\n', "app/page.tsx")).toHaveLength(1);
  });

  it("allows types, useT() and getI18n(), and the provider itself", async () => {
    expect(await restricted('import type { Translate } from "@/lib/i18n";\nexport type X = Translate;\n', "components/Foo.tsx")).toEqual([]);
    expect(await restricted('import { useT } from "@/components/I18nProvider";\nexport const x = useT;\n', "components/Foo.tsx")).toEqual([]);
    expect(await restricted('import { createTranslator } from "@/lib/i18n";\nexport const x = createTranslator;\n', "components/I18nProvider.tsx")).toEqual([]);
  });
}, 60_000);
