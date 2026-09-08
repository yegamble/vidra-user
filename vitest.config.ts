import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit/component tests run under Vitest; Playwright e2e specs live in ./e2e and
// are excluded here so the two runners never overlap. The "@/*" alias mirrors
// tsconfig paths so test imports resolve like app code.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Default environment is node (lib/* pure-logic + API-client tests). RTL
    // component-unit tests (components/**/*.test.tsx) opt into jsdom per-file
    // via a `// @vitest-environment jsdom` docblock, so we don't pay for jsdom
    // on the node suites and keep one runner + one config.
    environment: "node",
    // An empty run is a failed run. This is already vitest's default; stating it
    // means a future `--passWithNoTests` (or a glob edit that matches nothing)
    // cannot turn the required unit gate into a no-op that still exits 0.
    passWithNoTests: false,
    // Under CI also emit JUnit, which frontend-ci.yml uploads as an artifact so
    // the per-test record of a green check outlives the run page's logs.
    reporters: process.env.CI
      ? ["default", ["junit", { outputFile: "test-report/vitest-junit.xml" }]]
      : ["default"],
    include: [
      "lib/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.tsx",
    ],
  },
});
