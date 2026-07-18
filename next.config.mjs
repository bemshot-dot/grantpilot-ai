/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // This dev machine is chronically low on free RAM; multiple parallel
  // static-generation workers intermittently fail to spawn (ENOMEM).
  // Single worker is slower but reliable. Safe to raise on a machine
  // with more headroom.
  experimental: {
    cpus: 1
  }
};

export default nextConfig;
