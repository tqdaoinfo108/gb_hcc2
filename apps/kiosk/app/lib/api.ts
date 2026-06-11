import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

export type KioskDeviceState = {
  deviceId: string;
  location: string;
  version: string;
  isLocked: boolean;
  latestStatus: {
    online: boolean;
    cpuPercent?: number | null;
    ramPercent?: number | null;
    diskPercent?: number | null;
    temperatureC?: number | null;
    currentUrl?: string | null;
    currentStep?: string | null;
  } | null;
};

export async function getDeviceState(deviceId: string): Promise<KioskDeviceState | null> {
  const response = await fetch(`${apiUrl}/devices/${encodeURIComponent(deviceId)}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  const device = JSON.parse(text);
  if (!device) {
    return null;
  }

  return {
    deviceId: device.deviceId,
    location: device.location,
    version: device.version,
    isLocked: device.isLocked,
    latestStatus: device.statuses?.[0] ?? null
  };
}
