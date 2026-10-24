import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones on the shop Wi-Fi open the dev server by the laptop's LAN address.
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
