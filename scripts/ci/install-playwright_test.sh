#!/usr/bin/env bash
# Regression suite for scripts/ci/install-playwright.sh.
#
# Why it exists: the installer's whole point is what it does when the package
# mirror misbehaves, which a healthy run never exercises. Without this suite
# the wait, the backoff, the retry and the time bound are code every green
# lane walks straight past.
#
# How: stub `npx`, `getent` and `sleep`, first on PATH, log their arguments and
# take their exit codes one per call from a plan file (the last code repeats).
#
#   bash scripts/ci/install-playwright_test.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
script=${INSTALL_PLAYWRIGHT_SCRIPT:-$here/install-playwright.sh}
[ -r "$script" ] || { echo "install-playwright_test: $script is missing" >&2; exit 1; }

tmp=$(mktemp -d "${TMPDIR:-/tmp}/install-playwright-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin"

cat >"$tmp/bin/stub" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
name=$1; shift
printf '%s\n' "$*" >>"$STUB_DIR/$name.calls"
n=$(wc -l <"$STUB_DIR/$name.calls" | tr -d ' ')
code=$(sed -n "${n}p" "$STUB_DIR/$name.plan")
[ -n "$code" ] || code=$(tail -n 1 "$STUB_DIR/$name.plan")
exit "${code:-0}"
STUB
cat >"$tmp/bin/npx" <<'STUB'
#!/usr/bin/env bash
[ "$1" = playwright ] || { echo "unexpected npx $*" >&2; exit 64; }
exec "$STUB_DIR/bin/stub" "npx-$2" "${@:3}"
STUB
for name in getent sleep; do
  cat >"$tmp/bin/$name" <<STUB
#!/usr/bin/env bash
exec "\$STUB_DIR/bin/stub" $name "\$@"
STUB
done
chmod +x "$tmp/bin/"*
printf 'http://mirror-a.test/ubuntu/\tpriority:1\nhttps://mirror-b.test/ubuntu/\tpriority:2\n' >"$tmp/mirrors.txt"

failures=0
plan() { local name=$1; shift; printf '%s\n' "$@" >"$tmp/$name.plan"; } # n-th call exits with the n-th code
calls() { if [ -f "$tmp/$1.calls" ]; then wc -l <"$tmp/$1.calls" | tr -d ' '; else echo 0; fi; }
# run <budget seconds> <mirrors file>: sets $rc and $out.
run() {
  rm -f "$tmp"/*.calls
  set +e
  out=$(STUB_DIR="$tmp" PATH="$tmp/bin:$PATH" PLAYWRIGHT_DEPS_BUDGET_SECONDS=$1 \
    PLAYWRIGHT_APT_MIRRORS_FILE=$2 bash "$script" chromium 2>&1)
  rc=$?
  set -e
}
check() { # check <description> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1: got '$2', want '$3'"; failures=$((failures + 1)); fi
}
has() { if printf '%s' "$out" | grep -q -- "$2"; then echo "ok   - $1"; else echo "FAIL - $1: output lacks '$2'"; failures=$((failures + 1)); fi; }

echo "# healthy mirror: one pass, nothing retried, nothing hidden"
plan getent 0; plan npx-install-deps 0; plan npx-install 0; plan sleep 0
run 600 "$tmp/mirrors.txt"
check "exits 0" "$rc" 0
check "system packages installed once" "$(calls npx-install-deps)" 1
check "browser installed once" "$(calls npx-install)" 1
check "asks for the same browser both times" "$(cat "$tmp/npx-install-deps.calls" "$tmp/npx-install.calls" | tr '\n' ' ')" "chromium chromium "
check "never sleeps" "$(calls sleep)" 0
check "raises no warning" "$(printf '%s' "$out" | grep -c '::warning::' || true)" 0

echo "# mirror does not resolve at first: waits with backoff, then installs once"
plan getent 2 2 2 2 0   # two rounds over both mirrors fail, then the first resolves
run 600 "$tmp/mirrors.txt"
check "exits 0" "$rc" 0
check "backs off, growing" "$(tr '\n' ' ' <"$tmp/sleep.calls")" "5 10 "
check "apt is not started until a mirror resolves" "$(calls npx-install-deps)" 1
has "says it waited" "::warning::"

echo "# second mirror alone resolves: that is enough for apt to fall back to"
plan getent 2 0
run 600 "$tmp/mirrors.txt"
check "exits 0 without waiting" "$rc:$(calls sleep)" "0:0"

echo "# apt fails once: retried, and the retry is announced"
plan getent 0; plan npx-install-deps 100 0
run 600 "$tmp/mirrors.txt"
check "exits 0" "$rc" 0
check "system packages attempted twice" "$(calls npx-install-deps)" 2
has "announces the retry" "::warning::.*install-deps"

echo "# mirror never resolves: bounded, apt still gets its one try, the lane fails loudly"
plan getent 2; plan npx-install-deps 100
run 0 "$tmp/mirrors.txt"
check "exits 1" "$rc" 1
check "apt tried exactly once" "$(calls npx-install-deps)" 1
check "browser download not attempted" "$(calls npx-install)" 0
has "one clear error" "::error::"

echo "# no mirror list (not a hosted runner): nothing to wait for"
plan getent 2; plan npx-install-deps 0
run 600 "$tmp/absent.txt"
check "exits 0" "$rc" 0
check "does not probe" "$(calls getent)" 0

echo "# browser download: retried, then given up on"
plan getent 0; plan npx-install-deps 0; plan npx-install 1 1 0
run 600 "$tmp/mirrors.txt"
check "third attempt succeeds" "$rc:$(calls npx-install)" "0:3"
plan npx-install 1
run 600 "$tmp/mirrors.txt"
check "three failures fail the step" "$rc:$(calls npx-install)" "1:3"
has "one clear error" "::error::"

if [ "$failures" -gt 0 ]; then echo "install-playwright_test: $failures check(s) failed" >&2; exit 1; fi
echo "install-playwright_test: all checks passed"
