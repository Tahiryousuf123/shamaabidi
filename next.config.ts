import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow firebase-admin and nodemailer to bundle for Node.js server
  serverExternalPackages: ['firebase-admin', 'nodemailer', 'imapflow'],
  
  // Enable experimental features needed
  experimental: {
    // Needed for streaming in App Router
  },
};

export default nextConfig;
