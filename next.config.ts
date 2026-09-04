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
      // NOTE: /videos/watch/:id is NOT handled here any more. It moved to
      // app/videos/watch/[id]/route.ts, because a static rewrite cannot do what
      // that path now needs: the uuid in it may be this instance's own id OR the
      // SOURCE uuid of a video imported from PeerTube, and only a backend lookup
      // can tell them apart. Rewriting blindly to /videos/:id was right for the
      // first and 404'd every one of the second.
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
