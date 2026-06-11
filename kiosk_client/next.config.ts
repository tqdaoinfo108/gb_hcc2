import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "node:path";

// Load root .env so NEXT_PUBLIC_ vars are available at build/start time
config({ path: resolve(__dirname, "../.env") });

const isTauriBuild = process.env.TAURI_BUILD === "true";
const releaseApiUrl = process.env.TAURI_API_URL ?? "http://apihcc.gvbsoft.vn";
const apiUrl = isTauriBuild
  ? releaseApiUrl
  : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const wsUrl = isTauriBuild
  ? process.env.TAURI_WS_URL ?? releaseApiUrl
  : process.env.NEXT_PUBLIC_WS_URL ?? apiUrl;

const nextConfig: NextConfig = {
  output: isTauriBuild ? "export" : undefined,
  outputFileTracingRoot: resolve(__dirname, "../"),
  images: {
    unoptimized: isTauriBuild,
  },
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_WS_URL: wsUrl,
  },
};

export default nextConfig;
