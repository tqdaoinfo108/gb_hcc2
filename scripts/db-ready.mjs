import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { requireEnv } from "./env.mjs";

const databaseUrl = requireEnv("DATABASE_URL");

async function ensureDatabaseExists() {
  const targetUrl = new URL(databaseUrl);
  const databaseName = targetUrl.pathname.replace(/^\//, "");
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";

  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    if (result.rowCount === 0) {
      const escapedName = databaseName.replace(/"/g, '""');
      await client.query(`CREATE DATABASE "${escapedName}"`);
      console.log(`Database ${databaseName} created.`);
    }
  } finally {
    await client.end();
  }
}

await ensureDatabaseExists();

const prisma = new PrismaClient();
try {
  await prisma.$queryRaw`SELECT 1`;
  console.log("Database connection ready.");
} finally {
  await prisma.$disconnect();
}
