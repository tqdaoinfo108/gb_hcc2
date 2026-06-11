/**
 * GET /api/device
 *
 * Server-side endpoint that reads device.json from the project root and returns
 * the kiosk serial number. This intentionally does NOT use environment variables
 * — each physical machine has its own device.json file (gitignored) with a unique
 * serial in the format: {PREFIX}-{YEAR}-{PROVINCE_CODE}-{SEQ}  e.g. KB-2026-HN-001
 */
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-static";

interface DeviceFile {
  serial?: string;
}

export function GET() {
  try {
    const filePath = join(process.cwd(), "device.json");
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as DeviceFile;

    if (!data.serial || typeof data.serial !== "string") {
      throw new Error("device.json is missing a valid 'serial' field");
    }

    return NextResponse.json({ serial: data.serial.trim() });
  } catch (err) {
    // Fallback: generate a deterministic default using the current year.
    // This ensures the kiosk can boot even when device.json is absent,
    // but operators should always provision a proper device.json in production.
    const year = new Date().getFullYear();
    const fallback = `KB-${year}-HN-001`;
    console.warn(`[device/route] Could not read device.json (${(err as Error).message}). Falling back to: ${fallback}`);
    return NextResponse.json({ serial: fallback });
  }
}
