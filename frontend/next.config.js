/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Requests arriving through a cloudflared quick tunnel carry the tunnel's
  // Host header, which the dev server otherwise rejects as cross-origin.
  allowedDevOrigins: ['*.trycloudflare.com'],

  // Experimental features
  experimental: {
    optimizePackageImports: ['@radix-ui/*'],
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // Redirects (if needed)
  async redirects() {
    return [];
  },

  // Rewrites (if needed)
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    };
  },
};

module.exports = nextConfig;
