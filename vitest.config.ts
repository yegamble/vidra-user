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
    // Node 26 installs an EXPERIMENTAL, INERT `localStorage` global: without
    // `--localstorage-file` the accessor returns undefined (and warns). Vitest's
    // jsdom environment copies jsdom's window keys onto globalThis but SKIPS any
    // key that already exists there, so Node's stub shadows jsdom's real Storage
    // and every `window.localStorage.*` call dies with "Cannot read properties of
    // undefined". It cost this repo 82 test failures across 7 files when Node 25
    // first shipped the global, and it is why the toolchain sat on Node 24.
    // `sessionStorage` is untouched because Node defines no such global — which is
    // the tell that this is a shadowing collision, not a jsdom or vitest bug.
    // Turning the experimental API off restores the pre-Node-25 precondition, so
    // jsdom's own Storage is installed exactly as before. Set here rather than in
    // an `npm test` env var so `npx vitest`, watch mode and IDE runners get it too.
    execArgv: ["--no-experimental-webstorage"],
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
