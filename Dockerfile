# syntax=docker/dockerfile:1
#
# Production image for the vidra-user Next.js frontend, built on Next's standalone
# output (next.config.ts sets output: "standalone"). Multi-stage so the runtime
# image ships only the pruned server bundle + static assets.
#
# The API origin is RUNTIME configuration: the browser learns it per page load
# from /runtime-config.js (PUBLIC_API_BASE_URL env, "" = same-origin relative)
# and server-side fetches read INTERNAL_API_BASE_URL / API_BASE_URL at start —
# so ONE image serves any domain. The build needs no origin at all. The old
# build-time bake is still honoured as an override for special builds:
#   docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t vidra-user .

# --- deps: install dependencies against a cached layer ---
FROM node:26-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: compile the standalone server ---
FROM node:26-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Default EMPTY (= same-origin at runtime): lib/config.ts treats "" as unset,
# so a bare `docker build` produces the generic, runtime-configurable image.
ARG NEXT_PUBLIC_API_BASE_URL=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runner: minimal production runtime ---
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# `apk upgrade` FIRST, in the runner only (the one stage that ships): the base
# image lags the package repository. node:26-alpine inherits alpine:3.24's
# package set, which is rebuilt for Alpine point releases, not for each
# package fix — so a plain rebuild re-ships the base's copy. v0.6.4 shipped
# libssl3/libcrypto3 3.5.7-r0 (ten OpenSSL CVEs, CVSS up to 9.8) while
# 3.5.8-r0 was already in v3.24 main. Exposure here is low — the node binary
# embeds its own OpenSSL and does not link libssl; apk and busybox wget's
# https helper do — but a scanner cannot tell, and an advisory against the
# image is a real finding for every operator who scans.
# Trade-off, stated honestly: the image now takes whatever v3.24 main serves
# at build time, so two builds of one commit can differ in patch-level
# packages; the scan of the pushed digest is the record of what shipped. A
# builder that reuses a cached layer for this RUN (e.g. publish-container's
# GHA cache, same base digest) also reuses its package set.
RUN apk upgrade --no-cache \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
# Standalone output bundles a minimal server + pruned node_modules; static assets
# and public/ must be copied alongside it.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
