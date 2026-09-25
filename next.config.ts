import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone server output — `scripts/deploy.sh` ships `.next/standalone`
  // to the VM with no node_modules install on the target.
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
