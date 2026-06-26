import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "patchright",
    "patchright-core",
    "playwright-extra",
    "puppeteer-extra-plugin-stealth",
    "@cliqz/adblocker-playwright",
    "bullmq",
    "ioredis",
  ],
};

export default nextConfig;
