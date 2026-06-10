import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

@Injectable()
export class RealtimeService {
  private cmsServer?: Server;
  private deviceSockets = new Map<string, Socket>();
  private socketDeviceIds = new Map<string, string>();

  bindCms(server: Server) {
    this.cmsServer = server;
  }

  registerDevice(socket: Socket, deviceId: string) {
    const previous = this.deviceSockets.get(deviceId);
    if (previous && previous.id !== socket.id) {
      this.socketDeviceIds.delete(previous.id);
    }
    this.deviceSockets.set(deviceId, socket);
    this.socketDeviceIds.set(socket.id, deviceId);
  }

  unregisterDevice(socket: Socket): string | undefined {
    const deviceId = this.socketDeviceIds.get(socket.id);
    if (deviceId) {
      if (this.deviceSockets.get(deviceId)?.id === socket.id) {
        this.deviceSockets.delete(deviceId);
      }
      this.socketDeviceIds.delete(socket.id);
    }
    return deviceId;
  }

  emitToCms(event: string, payload: unknown) {
    this.cmsServer?.emit(event, payload);
  }

  sendCommand(deviceId: string, payload: unknown) {
    const socket = this.deviceSockets.get(deviceId);
    if (socket) {
      socket.emit('command', payload);
    }
    this.emitToCms('command', payload);
  }

  sendToDevice(deviceId: string, event: string, payload: unknown): boolean {
    const socket = this.deviceSockets.get(deviceId);
    if (!socket) return false;
    socket.emit(event, payload);
    return true;
  }
}
