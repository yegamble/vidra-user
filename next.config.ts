import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained production server (.next/standalone) so the Docker
  // image can run `node server.js` with a pruned node_modules. See Dockerfile.
  output: "standalone",
};

export default nextConfig;
