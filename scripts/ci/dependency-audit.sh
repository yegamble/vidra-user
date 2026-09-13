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
#   runtime dependencies (what the image ships)  — ANY advisory fails;
#   the whole tree (build, lint and test tooling) — high or critical fails.
# Lower-severity tooling advisories are still printed by the second audit.
#
# FAIL-CLOSED. `npm audit` exits non-zero when the advisory endpoint cannot be
# reached, and that exit is kept: a scan that did not run is not a clean scan.
# Both audits always run, so one failure does not hide the other's findings.
#
#   npm run audit:deps
set -uo pipefail

echo "dependency-audit: node $(node --version), npm $(npm --version), $(date -u +%Y-%m-%dT%H:%M:%SZ)"
status=0

echo "== runtime dependencies (--omit=dev): any advisory fails"
npm audit --package-lock-only --omit=dev --audit-level=low || status=1

echo "== full tree: high or critical fails"
npm audit --package-lock-only --audit-level=high || status=1

if [ "$status" -ne 0 ]; then
  echo "::error::dependency-audit: an advisory at or above policy was found, or the audit could not run. Upgrade the named package; do not raise the level to get green." >&2
fi
exit "$status"
