import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Required for drag-drop to work properly
  output: 'standalone', // Required for Docker deployment
  typescript: {
    // Skip type checking during build for faster deployment
    // Type errors should be caught in development/CI
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ibb.co',
      },
    ],
  },
};

export default nextConfig;
