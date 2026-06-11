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

  /**
   * Job-scoped subscriptions. A kiosk screen subscribes to the job it launched
   * by jobId — the ONE identifier both the runner and the kiosk always hold.
   * Live frames + progress are delivered by jobId so streaming never depends on
   * a deviceSerial being present in the job or matching the heartbeat key.
   */
  private jobSockets = new Map<string, Set<Socket>>();
  private socketJobIds = new Map<string, Set<string>>();

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
    // Also drop any job subscriptions held by this socket.
    const jobs = this.socketJobIds.get(socket.id);
    if (jobs) {
      for (const jobId of jobs) {
        const js = this.jobSockets.get(jobId);
        js?.delete(socket);
        if (js && js.size === 0) this.jobSockets.delete(jobId);
      }
      this.socketJobIds.delete(socket.id);
    }
    return deviceId;
  }

  /** A kiosk screen subscribes to live updates for a specific job. */
  subscribeJob(socket: Socket, jobId: string) {
    if (!jobId) return;
    let set = this.jobSockets.get(jobId);
    if (!set) { set = new Set<Socket>(); this.jobSockets.set(jobId, set); }
    set.add(socket);
    let jobs = this.socketJobIds.get(socket.id);
    if (!jobs) { jobs = new Set<string>(); this.socketJobIds.set(socket.id, jobs); }
    jobs.add(jobId);
  }

  unsubscribeJob(socket: Socket, jobId: string) {
    const set = this.jobSockets.get(jobId);
    set?.delete(socket);
    if (set && set.size === 0) this.jobSockets.delete(jobId);
    this.socketJobIds.get(socket.id)?.delete(jobId);
  }

  /** Emit to every socket subscribed to a job. Returns true if ≥1 reached. */
  sendToJob(jobId: string, event: string, payload: unknown): boolean {
    const set = this.jobSockets.get(jobId);
    if (!set || set.size === 0) return false;
    let delivered = false;
    for (const socket of set) {
      try { socket.emit(event, payload); delivered = true; } catch { /* dead socket */ }
    }
    return delivered;
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
