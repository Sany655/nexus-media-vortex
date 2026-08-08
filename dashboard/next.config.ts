import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe']
};

export default nextConfig;
