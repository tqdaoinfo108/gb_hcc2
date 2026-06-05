import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(".env") });
config({ path: resolve(".env.local"), override: true });

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
