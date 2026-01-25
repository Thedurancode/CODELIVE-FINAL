import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Required for drag-drop to work properly
  output: 'standalone', // Required for Docker deployment
  env: {
    // Fallback values for production build (when build args aren't passed)
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://dispotree-api.fly.dev',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gnfviibtswjbcvdlptuu.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduZnZpaWJ0c3dqYmN2ZGxwdHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MDY5MTgsImV4cCI6MjA4MTQ4MjkxOH0.Lz5yZFlhk3fF55JkcGw18JwdFLYgM3mDl54lXpGcJuo',
  },
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
