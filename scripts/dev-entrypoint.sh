#!/bin/sh
# Dev-container entrypoint for `make dev-hot` (see Dockerfile.dev).
# 1. Keeps the node_modules named volume in sync with package-lock.json
#    (the volume is seeded from the image on first use; after that, dependency
#    changes are detected by hash and reinstalled in-container — no manual
#    volume surgery needed).
# 2. Runs the olm-wasm prebuild (`npm run dev` does not trigger `prebuild`).
# 3. Starts next dev with webpack + polling: reliable HMR through macOS bind
#    mounts, where Turbopack's file watching drops events (vercel/next.js#80665).
set -e

STAMP=node_modules/.package-lock.hash
HASH="$(md5sum package-lock.json | cut -d' ' -f1)"
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$HASH" ]; then
  echo "[dev-entrypoint] package-lock.json changed -> npm ci"
  npm ci
  echo "$HASH" > "$STAMP"
fi

node scripts/copy-olm-wasm.mjs

exec node_modules/.bin/next dev --webpack -H 0.0.0.0 -p 3000
