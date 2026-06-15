// Sync a version string into the kiosk client's three version sources so the
// built MSI, the app's reported version, and the OTA release all agree.
//
//   node scripts/set-version.mjs 1.0.42
//
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Usage: node scripts/set-version.mjs <semver>  (got: ${version ?? "<none>"})`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(root, "kiosk_client");

// 1) package.json
const pkgPath = resolve(client, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// 2) tauri.conf.json
const confPath = resolve(client, "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

// 3) Cargo.toml — replace the first `version = "..."` (the [package] version)
const cargoPath = resolve(client, "src-tauri", "Cargo.toml");
let cargo = readFileSync(cargoPath, "utf8");
let replaced = false;
cargo = cargo.replace(/^version\s*=\s*".*"$/m, () => {
  replaced = true;
  return `version = "${version}"`;
});
if (!replaced) {
  console.error("Could not find a version line in Cargo.toml");
  process.exit(1);
}
writeFileSync(cargoPath, cargo);

console.log(`✓ Set kiosk client version to ${version} (package.json, tauri.conf.json, Cargo.toml)`);
