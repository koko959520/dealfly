/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['pino', 'pino-pretty', 'firebase-admin'],
  },
  images: {
    remotePatterns: [],
  },
}

export default nextConfig
