import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained production server (.next/standalone) so the Docker
  // image can run `node server.js` with a pruned node_modules. See Dockerfile.
  // `next start` still works (it warns that standalone output exists) — the
  // Playwright webServer keeps using it outside Docker.
  output: "standalone",
};

export default nextConfig;
