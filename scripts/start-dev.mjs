import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const root = resolve(import.meta.dirname, "..");
process.chdir(root);

loadEnvFile(resolve(root, ".env"), false);
loadEnvFile(resolve(root, ".env.local"), true);

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is missing. Add it to .env before starting dev.");
}

if (!process.env.DATABASE_URL.includes("hcc_db")) {
  console.warn("[WARN] DATABASE_URL does not contain hcc_db. Continuing because .env is the source of truth.");
}

process.env.NODE_ENV = "development";
process.env.NEXT_TELEMETRY_DISABLED = "1";

console.log("Smart Kiosk Platform DEV");
console.log("Root:", root);
console.log("Database: using DATABASE_URL from .env");
console.log("");

if (!existsSync(resolve(root, "node_modules"))) {
  run("npm install", "Installing dependencies");
}

run("npm run bootstrap", "Checking database and applying migrations");

await warnIfPortsInUse([4000, 3001, 3002]);

console.log("");
console.log("Starting dev services:");
console.log("  API:    http://127.0.0.1:4000");
console.log("  CMS:    http://127.0.0.1:3001");
console.log("  Kiosk:  http://127.0.0.1:3002");
console.log("");
console.log("Press Ctrl+C to stop all services.");
console.log("");

const children = [
  startService("API", "npm run dev -w @smart-kiosk/api"),
  startService("CMS", "npm run dev -w @smart-kiosk/cms"),
  startService("KIOSK", "npm run dev -w @smart-kiosk/kiosk")
];

process.on("SIGINT", () => {
  stopServices();
});

process.on("SIGTERM", () => {
  stopServices();
});

let stopping = false;
for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping && code !== 0) {
      console.error(`[ERROR] ${child.serviceName} exited with code ${code}. Stopping all services.`);
      stopServices(code ?? 1);
    }
  });
}

function loadEnvFile(filePath, override) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^["']|["']$/g, "");

    if (key && (override || process.env[key] === undefined)) {
      process.env[key] = value;
    }
  }
}

function run(commandLine, label) {
  console.log(`[START] ${label}`);
  const result = spawnSync(commandRunner(), commandArgs(commandLine), {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    console.error(`[ERROR] Failed to run ${commandLine}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function startService(name, commandLine) {
  const child = spawn(commandRunner(), commandArgs(commandLine), {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });

  child.serviceName = name;
  prefixStream(name, child.stdout);
  prefixStream(name, child.stderr);
  return child;
}

function prefixStream(name, stream) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        console.log(`[${name}] ${line}`);
      }
    }
  });
  stream.on("end", () => {
    if (buffer.trim()) {
      console.log(`[${name}] ${buffer}`);
    }
  });
}

function stopServices(exitCode = 0) {
  stopping = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(exitCode), 500);
}

function commandRunner() {
  return process.platform === "win32" ? "cmd.exe" : "sh";
}

function commandArgs(commandLine) {
  return process.platform === "win32"
    ? ["/d", "/s", "/c", commandLine]
    : ["-lc", commandLine];
}

async function warnIfPortsInUse(ports) {
  for (const port of ports) {
    const available = await isPortAvailable(port);
    if (!available) {
      console.warn(`[WARN] Port ${port} is already in use. The matching dev service may fail to start.`);
    }
  }
}

function isPortAvailable(port) {
  return new Promise((resolveResult) => {
    const server = net.createServer();
    server.once("error", () => resolveResult(false));
    server.once("listening", () => {
      server.close(() => resolveResult(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function fail(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}
