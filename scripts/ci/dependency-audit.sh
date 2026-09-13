#!/usr/bin/env bash
# Dependency advisory gate (QLT-01 / REL-01 security facet).
#
# WHY THIS EXISTS. v0.6.4 shipped next@16.3.0 while GHSA-2xp9-vwfh-vxw4 and
# GHSA-p293-qw3h-jr36 (both critical, fixed in 16.3.3) were public, and nothing
# noticed: this repo ran no advisory check, and Dependabot alerts/security
# updates are disabled on it. A weekly version-update PR is not a security
# signal. So the lockfile is audited on every PR, on main, and daily — an
# advisory published against an unchanged lockfile must still turn main red.
#
# Policy, stated once here so a change to it is a reviewed diff:
#   the non-dev dependency tree (--omit=dev)      — ANY advisory fails
#                                                   (--audit-level=info);
#   the whole tree (build, lint and test tooling) — high or critical fails.
# Lower-severity tooling advisories are still printed by the second audit.
#
# WHAT --omit=dev COMPUTES, and the gap it leaves. It is the lockfile minus
# devDependencies — package.json's declaration, NOT what the image ships. For a
# bundled Next app the two differ in both directions: build-time packages
# declared as dependencies are over-included, and `next build` INLINES any
# devDependency that `app/` imports, so a bundled devDependency is only audited
# at the second, high/critical threshold. Residual gap, accepted for now: an
# advisory below high in a bundled devDependency does not fail this gate.
#
# FAIL-CLOSED. `npm audit` exits non-zero when the advisory endpoint cannot be
# reached, and that exit is kept: a scan that did not run is not a clean scan.
# Both audits always run, so one failure does not hide the other's findings.
#
# The scope flags are explicit so no config can narrow them: an `.npmrc` (or
# npm_config_*) with `offline=true` makes `npm audit` print "found 0
# vulnerabilities" and exit 0 WITHOUT asking the registry — verified against a
# lockfile carrying a critical advisory — and `omit=dev` would silently drop the
# tooling tree from the second audit. --offline=false and --include=dev pin
# both, and --registry pins the advisory endpoint: an `npm_config_registry` or
# `.npmrc` mirror that answers the bulk-advisory request with `{}` would
# otherwise turn "found 0 vulnerabilities" into a lie.
#
# EMPTY-TREE GUARD. A lockfile holding only the root entry audits clean (npm
# 10.9.2 and 11.19.1 both: "found 0 vulnerabilities", exit 0). So the first
# audit is repeated as JSON and its `metadata.dependencies.total` — the number
# of packages the audit examined; the same shape in npm 10 and 11 — must clear
# the floor below.
#
#   npm run audit:deps
set -uo pipefail

REGISTRY=https://registry.npmjs.org/

# Floor for the package count the audit examined. The lockfile carried 676
# packages on 2026-09-13 (`node -e 'const l = require("./package-lock.json");
# console.log(Object.keys(l.packages).length - 1)'`); the floor sits well below
# that so a deliberate pruning does not trip it, while a hollowed-out lockfile
# (0) does. Lower it in the same PR as a pruning that takes the tree under it,
# with the new count in this comment — never to get green.
MIN_PACKAGES=400

echo "dependency-audit: node $(node --version), npm $(npm --version), $(date -u +%Y-%m-%dT%H:%M:%SZ)"
status=0

echo "== non-dev dependency tree (--omit=dev): any advisory fails"
npm audit --package-lock-only --offline=false --registry="$REGISTRY" --omit=dev --audit-level=info || status=1

echo "== the same audit as JSON: how many packages it examined (floor $MIN_PACKAGES)"
report=$(mktemp)
trap 'rm -f "$report"' EXIT
# Its verdict was taken by the run above; only the count is read from this one.
npm audit --package-lock-only --offline=false --registry="$REGISTRY" --omit=dev --audit-level=info --json > "$report" 2>/dev/null || true
# shellcheck disable=SC2016  # the ${...} below is a JS template literal, not shell
counts=$(node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const d = (r.metadata || {}).dependencies;
  if (!d || !Number.isInteger(d.total)) process.exit(1);
  console.log(["total", "prod", "dev", "optional", "peer"].map((k) => `${k}=${d[k]}`).join(" "));
' "$report") || counts=""
if [ -z "$counts" ]; then
  echo "::error::dependency-audit: could not read metadata.dependencies.total from the audit report — the audit did not examine the lockfile." >&2
  status=1
else
  echo "packages examined: $counts"
  total=${counts%% *}
  total=${total#total=}
  if [ "$total" -lt "$MIN_PACKAGES" ]; then
    echo "::error::dependency-audit: the audit examined $total packages, below the floor of $MIN_PACKAGES. An empty or hollowed-out lockfile audits clean, and that is not a clean audit." >&2
    status=1
  fi
fi

echo "== full tree: high or critical fails"
npm audit --package-lock-only --offline=false --registry="$REGISTRY" --include=dev --audit-level=high || status=1

if [ "$status" -ne 0 ]; then
  echo "::error::dependency-audit: an advisory at or above policy was found, or the audit could not run. Upgrade the named package; do not raise the level to get green." >&2
fi
exit "$status"
