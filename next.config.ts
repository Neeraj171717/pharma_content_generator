import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['pdf-parse'],
  images: {
    localPatterns: [{ pathname: '/api/ai/hero/download' }],
  },
};

export default nextConfig;
