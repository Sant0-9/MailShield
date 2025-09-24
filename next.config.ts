import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure Node.js runtime for serverless functions (required for DNS lookups)
  serverExternalPackages: ['dns']
};

export default nextConfig;
