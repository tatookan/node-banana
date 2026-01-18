import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '86f9e36c36607e71ef5a1630bdbef338.r2.cloudflarestorage.com',
      },
    ],
    // Increase timeout for R2 images (in milliseconds)
    minimumCacheTTL: 60,
    // Use unoptimized for R2 presigned URLs to avoid Next.js image optimization timeout
    unoptimized: false,
  },
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
