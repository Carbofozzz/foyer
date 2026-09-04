import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  agentRules: false,
  serverExternalPackages: ["genlayer-js"],
  outputFileTracingIncludes: {
    "/*": ["./contracts/court.py"],
  },
  turbopack: {
    resolveAlias: {
      "@base-org/account": "./lib/wallet/empty.ts",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": path.join(__dirname, "lib/wallet/empty.ts"),
    };
    return config;
  },
};

export default nextConfig;
