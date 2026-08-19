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
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
# Standalone output bundles a minimal server + pruned node_modules; static assets
# and public/ must be copied alongside it.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
