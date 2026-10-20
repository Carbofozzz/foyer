import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  agentRules: false,
  serverExternalPackages: ["genlayer-js"],
  outputFileTracingIncludes: {
    "/*": ["./contracts/court.py"],
    "/api/lock-broker": [
      "./scripts/foyer-lock.bundle.mjs",
      "./scripts/lock-broker.mjs",
      "./scripts/lock-x402.mjs",
      "./scripts/lock-secret.mjs",
    ],
  },
};

export default nextConfig;
