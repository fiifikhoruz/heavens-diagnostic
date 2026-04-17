import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false, // sync engine handles reconnect
  disable: process.env.NODE_ENV === "development", // no SW in dev
  workboxOptions: {
    disableDevLogs: true,
  },
});

const nextConfig: NextConfig = {};

export default withPWA(nextConfig);
