/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['coin.gecko.com', 'localhost'],
    unoptimized: process.env.NODE_ENV === 'development',
  },
  headers: async () => {
    // Never use a wildcard origin for an authenticated API. Defaults to the
    // app's own origin; set CORS_ALLOWED_ORIGIN to allow a separate frontend.
    const allowedOrigin =
      process.env.CORS_ALLOWED_ORIGIN ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:3000';
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: allowedOrigin },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
          { key: 'Vary', value: 'Origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
