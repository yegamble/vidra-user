import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Pin the React version for eslint-plugin-react instead of "detect" (the Next
  // preset default). Under ESLint 10 the plugin's filesystem-based version
  // detection calls the removed `context.getFilename()` and crashes the whole
  // lint run; an explicit version skips detection entirely. Keep in step with
  // the `react` dependency in package.json.
  {
    settings: {
      react: { version: "19.2" },
    },
  },
  // Observability: a single logger module is the only place console.* is allowed
  // (see .ralph/specs/observability.md). Everywhere else it is an error.
  {
    rules: {
      "no-console": "error",
      // Knip covers module exports; private dead code must block the gate too.
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
  // i18n: UI code translates through useT() (client) or getI18n() (server),
  // which follow the viewer's locale. The bare translator ignores it, and the
  // catalog registry would bundle every language into the client.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: ["components/I18nProvider.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/i18n",
              importNames: ["t", "createTranslator"],
              message: "Use useT() from @/components/I18nProvider (client) or getI18n() from @/lib/i18n/locale.server (server).",
            },
            { name: "@/lib/i18n/catalogs", message: "Server-only: getI18n() hands out the active catalog." },
          ],
        },
      ],
    },
  },
  // Dev/CI Node scripts (run via `node`, never shipped to the browser) — console
  // output is their entire purpose, so no-console does not apply to them.
  {
    files: ["scripts/**/*.{mjs,js,ts}"],
    rules: {
      "no-console": "off",
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated from vidra-core's OpenAPI spec (npm run codegen) — not hand-edited.
    "lib/api/generated.ts",
    // Test/build artifacts.
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    // Vendored @matrix-org/olm runtime, copied in by scripts/copy-olm-wasm.mjs
    // (emscripten glue — not our source to lint).
    "public/olm/**",
    // Vendored design templates (the visual source of truth for the redesign;
    // see .ralph/specs/design-system.md) — reference artifacts, never imported.
    ".ralph/design-templates/**",
  ]),
]);

export default eslintConfig;
