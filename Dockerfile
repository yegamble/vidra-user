# syntax=docker/dockerfile:1
#
# Production image for the vidra-user Next.js frontend, built on Next's standalone
# output (next.config.ts sets output: "standalone"). Multi-stage so the runtime
# image ships only the pruned server bundle + static assets.
#
# NOTE: NEXT_PUBLIC_* values are inlined into the CLIENT bundle at BUILD time, so
# the API base URL the browser calls is baked here via --build-arg, not at runtime.
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
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
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
