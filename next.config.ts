import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    proxyClientMaxBodySize: "50mb",  // Increase API route body limit to 50MB
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
