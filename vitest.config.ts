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
    include: [
      "lib/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.tsx",
    ],
  },
});
