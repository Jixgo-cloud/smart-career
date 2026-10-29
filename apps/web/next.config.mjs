/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@smartcareer/shared'],
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
