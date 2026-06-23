import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compress: true,
  async headers() {
    return [
      {
        source: '/data/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: process.env.NODE_ENV === 'production'
              ? 'public, max-age=3600, stale-while-revalidate=86400'
              : 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
