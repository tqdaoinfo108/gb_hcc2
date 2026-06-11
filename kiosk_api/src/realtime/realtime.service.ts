import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

@Injectable()
export class RealtimeService {
  private cmsServer?: Server;
  /**
   * A device (kiosk) can have MORE THAN ONE active socket at once — e.g. the
   * root shell keeps one open while a screen (procedure-submit) opens another.
   * We therefore track a Set per deviceId and broadcast to all of them, so a
   * screen's listener always receives events regardless of which socket
   * sent the most recent heartbeat.
   */
  private deviceSockets = new Map<string, Set<Socket>>();
  private socketDeviceIds = new Map<string, string>();

  bindCms(server: Server) {
    this.cmsServer = server;
  }

  registerDevice(socket: Socket, deviceId: string) {
    // If this socket was previously registered to another device, detach it.
    const prevDeviceId = this.socketDeviceIds.get(socket.id);
    if (prevDeviceId && prevDeviceId !== deviceId) {
      this.deviceSockets.get(prevDeviceId)?.delete(socket);
    }
    let set = this.deviceSockets.get(deviceId);
    if (!set) {
      set = new Set<Socket>();
      this.deviceSockets.set(deviceId, set);
    }
    set.add(socket);
    this.socketDeviceIds.set(socket.id, deviceId);
  }

  unregisterDevice(socket: Socket): string | undefined {
    const deviceId = this.socketDeviceIds.get(socket.id);
    if (deviceId) {
      const set = this.deviceSockets.get(deviceId);
      set?.delete(socket);
      if (set && set.size === 0) this.deviceSockets.delete(deviceId);
      this.socketDeviceIds.delete(socket.id);
    }
    return deviceId;
  }

  emitToCms(event: string, payload: unknown) {
    this.cmsServer?.emit(event, payload);
  }

  sendCommand(deviceId: string, payload: unknown) {
    this.broadcast(deviceId, 'command', payload);
    this.emitToCms('command', payload);
  }

  /** Emit an event to every live socket of a device. Returns true if ≥1 reached. */
  sendToDevice(deviceId: string, event: string, payload: unknown): boolean {
    return this.broadcast(deviceId, event, payload);
  }

  private broadcast(deviceId: string, event: string, payload: unknown): boolean {
    const set = this.deviceSockets.get(deviceId);
    if (!set || set.size === 0) return false;
    let delivered = false;
    for (const socket of set) {
      try { socket.emit(event, payload); delivered = true; } catch { /* dead socket */ }
    }
    return delivered;
  }
}
