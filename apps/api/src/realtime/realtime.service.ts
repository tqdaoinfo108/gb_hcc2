import { Injectable } from "@nestjs/common";
import type { Server, Socket } from "socket.io";
import type { CommandPayload, DeviceHeartbeatPayload } from "@smart-kiosk/shared-types";
import { socketEvents } from "@smart-kiosk/shared-types";

@Injectable()
export class RealtimeService {
  private cmsServer?: Server;
  private deviceSockets = new Map<string, Socket>();
  private socketDeviceIds = new Map<string, string>();

  bindCms(server: Server) {
    this.cmsServer = server;
  }

  registerDevice(socket: Socket, heartbeat: DeviceHeartbeatPayload) {
    this.deviceSockets.set(heartbeat.deviceId, socket);
    this.socketDeviceIds.set(socket.id, heartbeat.deviceId);
  }

  unregisterDevice(socket: Socket) {
    const deviceId = this.socketDeviceIds.get(socket.id);
    if (deviceId) {
      this.deviceSockets.delete(deviceId);
      this.socketDeviceIds.delete(socket.id);
    }
    return deviceId;
  }

  emitToCms(event: string, payload: unknown) {
    this.cmsServer?.emit(event, payload);
  }

  sendCommand(deviceId: string, payload: CommandPayload) {
    const socket = this.deviceSockets.get(deviceId);
    if (socket) {
      socket.emit(socketEvents.command, payload);
    }
    this.emitToCms(socketEvents.command, payload);
  }
}
