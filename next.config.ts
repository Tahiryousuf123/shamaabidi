import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow firebase-admin and nodemailer to bundle for Node.js server
  serverExternalPackages: ['firebase-admin', 'nodemailer', 'imapflow'],
  
  experimental: {},

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
