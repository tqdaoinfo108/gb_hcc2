import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "node:path";

// Load root .env so NEXT_PUBLIC_ vars are available at build/start time
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(__dirname, "../../"),
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    NEXT_PUBLIC_WS_URL:  process.env.NEXT_PUBLIC_WS_URL  ?? "http://localhost:4000",
  },
};

export default nextConfig;
