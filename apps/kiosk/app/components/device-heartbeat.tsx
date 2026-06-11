"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { CommandPayload, CommandResultPayload } from "@smart-kiosk/shared-types";
import { socketEvents } from "@smart-kiosk/shared-types";

type DeviceMetrics = {
  cpuPercent?: number;
  ramPercent?: number;
  diskPercent?: number;
  temperatureC?: number;
  network?: string;
};

async function collectMetrics(): Promise<DeviceMetrics> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return {};
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DeviceMetrics>("collect_device_metrics");
}

async function executeNativeCommand(command: CommandPayload) {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return { handled: false };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  if (command.command === "lock") {
    return invoke("lock_kiosk");
  }
  if (command.command === "unlock") {
    return invoke("unlock_kiosk");
  }
  if (command.command === "clear_cache") {
    return invoke("clear_session_data");
  }
  if (command.command === "restart_app") {
    return invoke("restart_app");
  }
  return { handled: true };
}

export function DeviceHeartbeat({
  deviceId,
  version,
  location,
  currentStep
}: {
  deviceId: string;
  version: string;
  location: string;
  currentStep?: string | null;
}) {
  const [socketState, setSocketState] = useState("connecting");

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "http://127.0.0.1:3001";
    const socket = io(`${wsUrl}/device`, {
      autoConnect: false,
      transports: ["websocket"]
    });

    async function sendHeartbeat() {
      if (!socket.connected) {
        return;
      }
      const metrics = await collectMetrics();
      socket.emit(socketEvents.heartbeat, {
        deviceId,
        version,
        location,
        status: "online",
        currentUrl: "https://dichvucong.gov.vn/",
        currentStep,
        ...metrics
      });
    }

    socket.on("connect", () => {
      setSocketState("online");
      void sendHeartbeat();
    });
    socket.on("disconnect", () => setSocketState("offline"));
    socket.on(socketEvents.command, async (command: CommandPayload) => {
      try {
        const response = await executeNativeCommand(command);
        const result: CommandResultPayload = {
          commandId: command.id,
          deviceId,
          command: command.command,
          status: "SUCCESS",
          response: response as Record<string, unknown>,
          timestamp: new Date().toISOString()
        };
        socket.emit(socketEvents.commandResult, result);
      } catch (error) {
        socket.emit(socketEvents.commandResult, {
          commandId: command.id,
          deviceId,
          command: command.command,
          status: "FAILED",
          response: { error: error instanceof Error ? error.message : String(error) },
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.connect();
    const heartbeatInterval = window.setInterval(sendHeartbeat, 30000);
    return () => {
      window.clearInterval(heartbeatInterval);
      socket.disconnect();
    };
  }, [currentStep, deviceId, location, version]);

  return <span className="heartbeat-sentinel" aria-hidden="true">{socketState}</span>;
}
