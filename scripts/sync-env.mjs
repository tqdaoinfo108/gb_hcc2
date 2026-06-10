/**
 * sync-env.mjs
 * Copies root .env to each project directory so they can also use a local .env.
 * Run: node scripts/sync-env.mjs
 */

import { copyFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const sourceEnv = resolve(root, ".env");

if (!existsSync(sourceEnv)) {
  console.error("[sync-env] ERROR: Root .env not found at", sourceEnv);
  console.error("[sync-env] Create a .env file at the root of the project first.");
  process.exit(1);
}

const targets = [
  resolve(root, "kiosk_api", ".env"),
  resolve(root, "kiosk_cms", ".env"),
  resolve(root, "kiosk_client", ".env"),
];

for (const target of targets) {
  copyFileSync(sourceEnv, target);
  console.log("[sync-env] Copied .env to", target);
}

console.log("[sync-env] Done. All project .env files are in sync.");
