import { PrismaClient } from "@prisma/client";
import { io } from "socket.io-client";
import { requireEnv } from "./env.mjs";

const prisma = new PrismaClient();
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

const checks = [];

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, status: "PASS" });
  } catch (error) {
    checks.push({
      name,
      status: "FAIL",
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

await check("NO MOCK DATA", async () => {
  const forbidden = ["mock", "faker", "dummy"];
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const roots = ["apps", "packages"];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "target") {
        continue;
      }
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|rs|sql|json)$/.test(entry.name)) {
        continue;
      }
      const text = (await readFile(path, "utf8")).toLowerCase();
      for (const word of forbidden) {
        if (text.includes(word)) {
          throw new Error(`${word} found in ${path}`);
        }
      }
    }
  }
  for (const root of roots) {
    await walk(root);
  }
});

await check("DATABASE READY", async () => {
  requireEnv("DATABASE_URL");
  await prisma.$queryRaw`SELECT 1`;
});

await check("MIGRATION WORKS", async () => {
  await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 1`;
});

await check("OTA READY", async () => {
  const row = await prisma.systemConfig.findUnique({ where: { key: "ota.enabled" } });
  if (!row) {
    throw new Error("system_config key ota.enabled is missing");
  }
});

await check("REMOTE CONTROL READY", async () => {
  await prisma.deviceCommand.findMany({ take: 1 });
});

await check("WEBSOCKET READY", async () => {
  await new Promise((resolve, reject) => {
    const socket = io(`${apiUrl}/cms`, {
      transports: ["websocket"],
      timeout: 4000,
      auth: { token: "preflight" }
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket.IO /cms namespace did not connect"));
    }, 5000);
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.disconnect();
      resolve();
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(error);
    });
  });
});

await prisma.$disconnect();

for (const item of checks) {
  console.log(`${item.status}: ${item.name}${item.reason ? ` - ${item.reason}` : ""}`);
}

if (checks.some((item) => item.status === "FAIL")) {
  process.exit(1);
}
