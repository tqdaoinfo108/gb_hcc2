import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.TAURI_BUILD === "true" ? "export" : undefined,
  transpilePackages: ["@smart-kiosk/shared-types"]
};

export default nextConfig;
