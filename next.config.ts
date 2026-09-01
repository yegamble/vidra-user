import type { NextConfig } from "next";

import { SECURITY_HEADERS } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Emit a self-contained production server (.next/standalone) so the Docker
  // image can run `node server.js` with a pruned node_modules. See Dockerfile.
  // `next start` still works (it warns that standalone output exists) — the
  // Playwright webServer keeps using it outside Docker.
  output: "standalone",
  poweredByHeader: false,
  async redirects() {
    return [
      // Creator stats moved into the Studio Analytics tab; keep old links working.
      // A framework-level redirect fires before the (auth-gated) studio layout, so
      // it works for anonymous and signed-in visitors alike.
      {
        source: "/studio/stats",
        destination: "/studio/analytics",
        permanent: true,
      },
      // Legacy watch-URL format. vidra-core mints `/videos/watch/{uuid}` in
      // its ActivityPub objects and Bluesky auto-posts, but this frontend has
      // only ever routed `/videos/{id}` — so every federated/cross-posted link
      // 404s without this. Core STILL emits that form on main (federation
      // outbox + collections, and the ATProto worker), so this is not a rescue
      // for old links: it is currently the only thing making federated links
      // work at all, and it cannot be removed until core mints `/videos/{id}`.
      // Next preserves the query string on redirects, so `?t=` start times
      // survive the hop.
      {
        source: "/videos/watch/:id",
        destination: "/videos/:id",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;
