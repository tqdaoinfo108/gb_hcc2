import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@smart-kiosk/ui", "@smart-kiosk/shared-types"]
};

export default nextConfig;
