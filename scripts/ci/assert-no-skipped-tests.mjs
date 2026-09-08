#!/usr/bin/env node
// Audit a Playwright JSON report for tests that skipped themselves (A39 / QLT-01).
//
// WHY THIS EXISTS. Specs in e2e-backed/ are written to bow out when the stack
// they need is not the stack they got:
//
//     test.skip(!SEARCH_ENABLED, "set E2E_SEARCH_SERVICE=true on a search-wired stack");
//
// Playwright reports a skipped test as neither pass nor fail, and the run exits
// 0. That is the right behaviour for a developer with a partial stack and the
// wrong behaviour in a CI lane that exists to prove exactly that flow — most
// sharply in the single-purpose lanes: channel-sync-backed runs one spec, and
// if the instance no longer advertises `features.channel_sync` that spec skips
// itself and the job goes green having tested nothing at all.
//
// So each lane declares what it is allowed to skip. The default is NOTHING.
//
//   node scripts/ci/assert-no-skipped-tests.mjs <report.json> [allowlist.txt]
//
// The allowlist is one extended regex per line (`#` comments ignored), matched
// against "<file> › <title>" and against the recorded skip annotation. Adding a
// line is a reviewed decision with a written reason, never a quiet green.
import { readFileSync } from "node:fs";

const [, , reportPath, allowPath] = process.argv;
if (!reportPath) {
  console.error("usage: assert-no-skipped-tests.mjs <playwright-report.json> [allowlist]");
  process.exit(2);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (err) {
  console.error(`::error::skip audit: cannot read Playwright JSON report ${reportPath}: ${err.message}`);
  console.error("A lane that produced no report proved nothing — check the run above.");
  process.exit(1);
}

const patterns = allowPath
  ? readFileSync(allowPath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => new RegExp(l))
  : [];

const skipped = [];
const counts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };

const walk = (suite, trail) => {
  const here = suite.title ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      // `status` is Playwright's per-test outcome: expected / unexpected /
      // flaky / skipped. `expected` covers a test that passed on a retry.
      const label = [...here, spec.title].join(" › ");
      if (test.status === "skipped") {
        counts.skipped += 1;
        // Playwright has carried the skip reason on the test and (in other
        // versions) on the spec; read both so a version bump cannot quietly
        // turn every reason into "" and start matching allowlist entries by
        // accident — or stop matching them and redden a correct lane.
        const notes = [...(test.annotations ?? []), ...(spec.annotations ?? [])];
        const why = notes.find((a) => a.type === "skip")?.description ?? "";
        skipped.push({ label, why });
      } else if (test.status === "flaky") {
        counts.flaky += 1;
      } else if (test.status === "unexpected") {
        counts.failed += 1;
      } else {
        counts.passed += 1;
      }
    }
  }
  for (const child of suite.suites ?? []) walk(child, here);
};
for (const suite of report.suites ?? []) walk(suite, []);

if (counts.passed + counts.failed + counts.flaky + counts.skipped === 0) {
  console.error(`::error::skip audit: ${reportPath} records no tests at all — this lane proved nothing.`);
  process.exit(1);
}

let bad = 0;
for (const { label, why } of skipped) {
  const subject = `${label} :: ${why}`;
  if (patterns.some((p) => p.test(subject))) {
    console.log(`  allowed skip: ${label}${why ? ` — ${why}` : ""}`);
  } else {
    bad += 1;
    console.error(`::error::skip audit: SKIPPED with an unregistered reason: ${label}${why ? ` — ${why}` : ""}`);
  }
}

console.log(
  `skip audit: ${counts.passed} passed, ${counts.flaky} flaky, ${counts.failed} failed, ${counts.skipped} skipped (${skipped.length - bad} registered).`,
);
if (counts.flaky > 0) {
  // Not a failure — the config retries twice under CI on purpose — but a flake
  // that nobody ever reads is a test that is quietly on its way out.
  console.log(`::warning::${counts.flaky} test(s) passed only on retry; see the uploaded report.`);
}
if (bad > 0) {
  console.error(
    `::error::skip audit failed: ${bad} unregistered skip(s) in ${reportPath}. Either give the lane the stack the spec needs, or register the skip with a reason in the lane's allowlist.`,
  );
  process.exit(1);
}
