#!/usr/bin/env bash
# Install one Playwright browser and its system packages without letting a
# flaky package mirror fail a lane before a single test has run.
#
#   bash scripts/ci/install-playwright.sh chromium
#
# FAILURE MODE (2026-11-11, PR #467). Every lane ran `npx playwright install
# --with-deps chromium`, which runs apt exactly once. On Azure-hosted runners
# apt could not resolve azure.archive.ubuntu.com, archive.ubuntu.com or
# security.ubuntu.com for over an hour while every other host resolved: exit
# 100, and the required lanes went red four times with no test executed.
#
# WHAT THIS DOES
#   1. System packages: waits, cheaply and with backoff, until one of apt's own
#      mirrors resolves, then runs `playwright install-deps`, retrying a failed
#      run while the time budget lasts. Waits and retries are ::warning::s, so
#      a lane that needed them says so.
#   2. Browser: `playwright install`, which downloads nothing when the
#      workflow's cache step restored this Playwright version's binaries, and
#      is retried when it does download.
#
# WHAT IT DOES NOT DO
#   - Outlast a mirror that stays down. No new apt run starts after
#     PLAYWRIGHT_DEPS_BUDGET_SECONDS (default 600), so the lane still fails:
#     later, and with one error naming the cause. System packages are not
#     cached, so a warm browser cache does not remove the need for the mirror.
#   - Change what is installed: same packages and browser build as
#     `install --with-deps`. Nothing is skipped to reach the tests.
#
# Regression suite: scripts/ci/install-playwright_test.sh (run by ci-guard).
set -euo pipefail

browser=${1:-}
[ -n "$browser" ] || { echo "usage: $0 <browser>" >&2; exit 2; }
budget=${PLAYWRIGHT_DEPS_BUDGET_SECONDS:-600}
mirrors_file=${PLAYWRIGHT_APT_MIRRORS_FILE:-/etc/apt/apt-mirrors.txt}

# The hosts apt is about to ask for, in apt's own order. A runner without the
# list (not a hosted image) has nothing to wait for; that is never an error.
hosts=""
if [ -r "$mirrors_file" ]; then
  hosts=$(grep -oE '^https?://[^/[:space:]]+' "$mirrors_file" | sed -E 's#^https?://##' | awk '!seen[$0]++' || true)
fi

# One resolving mirror is enough: apt falls back along the list by itself.
# getent asks the resolver apt uses, and fails in seconds where apt takes minutes.
a_mirror_resolves() {
  local host
  for host in $hosts; do
    if getent ahosts "$host" >/dev/null 2>&1; then return 0; fi
  done
  return 1
}

attempt=1
delay=5
while :; do
  if [ -n "$hosts" ]; then
    waited=0
    until a_mirror_resolves; do
      if [ "$SECONDS" -ge "$budget" ]; then
        # The probe must never be stricter than apt: it still gets its one run.
        echo "::warning::no apt mirror resolved in ${SECONDS}s; letting apt try once anyway"
        waited=0
        break
      fi
      echo "apt mirrors do not resolve yet (${SECONDS}s in); checking again in ${delay}s"
      waited=1
      sleep "$delay"
      delay=$((delay < 60 ? delay * 2 : 60))
    done
    if [ "$waited" = 1 ]; then
      echo "::warning::apt mirrors did not resolve for ${SECONDS}s; one does now, continuing"
    fi
  fi
  if npx playwright install-deps "$browser"; then break; fi
  if [ "$SECONDS" -ge "$budget" ]; then
    echo "::error::playwright install-deps ${browser} failed ${attempt} time(s) over ${SECONDS}s: the package mirror is unreachable or broken. No test has run."
    exit 1
  fi
  echo "::warning::playwright install-deps ${browser} failed (attempt ${attempt}, ${SECONDS}s in); retrying in ${delay}s"
  sleep "$delay"
  delay=$((delay < 60 ? delay * 2 : 60))
  attempt=$((attempt + 1))
done

attempt=1
until npx playwright install "$browser"; do
  if [ "$attempt" -ge 3 ]; then
    echo "::error::playwright install ${browser} failed ${attempt} times: the browser download is unreachable. No test has run."
    exit 1
  fi
  echo "::warning::playwright install ${browser} failed (attempt ${attempt}); retrying in $((attempt * 15))s"
  sleep $((attempt * 15))
  attempt=$((attempt + 1))
done
