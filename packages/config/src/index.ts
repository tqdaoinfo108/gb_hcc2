import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config();

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["query", "error", "warn"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

export const appConfig = {
  databaseUrl: () => requiredEnv("DATABASE_URL"),
  redisUrl: () => process.env.REDIS_URL ?? "redis://localhost:6379",
  jwtSecret: () => requiredEnv("JWT_SECRET"),
  apiPort: () => Number(process.env.API_PORT ?? 3001),
  apiUrl: () => process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001",
  wsUrl: () => process.env.NEXT_PUBLIC_WS_URL ?? "http://127.0.0.1:3001"
};
