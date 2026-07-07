import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace package directly.
  transpilePackages: ['@ticketing/shared'],
};

export default nextConfig;
