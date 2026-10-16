import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  agentRules: false,
  serverExternalPackages: ["genlayer-js"],
  outputFileTracingIncludes: {
    "/*": ["./contracts/court.py"],
  },
};

export default nextConfig;
