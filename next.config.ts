import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'better-sqlite3',
    'fluent-ffmpeg',
    '@ffmpeg-installer/ffmpeg',
    '@ffprobe-installer/ffprobe'
  ],
  turbopack: {
    root: process.cwd(),
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/data/**',
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
