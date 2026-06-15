import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { KioskDevicesService } from '../devices/kiosk-devices.service';
import { AckCommandDto, IssueCommandDto, RemoteCommand } from './remote.dto';

const ONLINE_WINDOW_MS = 60_000;

/** Commands that are fully handled server-side and resolve immediately,
 *  rather than being dispatched to the device and awaiting an ack. */
const SERVER_HANDLED: RemoteCommand[] = ['MAINTENANCE_ON', 'MAINTENANCE_OFF'];

@Injectable()
export class RemoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly devices: KioskDevicesService,
  ) {}

  /** Device list for the console, scoped by location (null = all). */
  async listDevices(locationIds: string[] | null) {
    const where: Prisma.KioskDeviceWhereInput = {
      deletedAt: null,
      ...(locationIds === null ? {} : { locationId: { in: locationIds } }),
    };
    const devices = await this.prisma.kioskDevice.findMany({
      where,
      include: {
        location: { select: { id: true, name: true, code: true } },
        components: { where: { deletedAt: null }, orderBy: { type: 'asc' } },
        healthLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ isEnabled: 'desc' }, { lastHeartbeat: 'desc' }],
    });
    return devices.map((d) => this.shape(d));
  }

  /** Full detail for one device: live state, metric history, command log, sessions. */
  async deviceDetail(id: string) {
    const device = await this.prisma.kioskDevice.findFirst({
      where: { deletedAt: null, OR: [{ id }, { deviceId: id }, { serialNumber: id }] },
      include: {
        location: { select: { id: true, name: true, code: true } },
        components: { where: { deletedAt: null }, orderBy: { type: 'asc' } },
        healthLogs: { orderBy: { createdAt: 'desc' }, take: 60 },
        actions: { orderBy: { performedAt: 'desc' }, take: 40 },
        sessions: { orderBy: { startTime: 'desc' }, take: 10, select: { id: true, status: true, startTime: true, endTime: true, currentScreen: true } },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    return {
      ...this.shape(device),
      healthHistory: device.healthLogs.map((h) => ({
        at: h.createdAt,
        cpu: h.cpuUsage,
        memory: h.memoryUsage,
        disk: h.diskUsage,
        temperature: h.temperatureC,
        latency: h.networkLatency,
        screen: h.currentScreen,
      })),
      actions: device.actions.map((a) => ({
        id: a.id,
        command: a.action,
        payload: a.payload,
        result: a.result,
        at: a.performedAt,
      })),
      sessions: device.sessions,
    };
  }

  /** Issue a remote command. Records a KioskAction and (for device commands)
   *  dispatches it over the realtime channel, awaiting the device's ack. */
  async issueCommand(id: string, dto: IssueCommandDto, actorId?: string) {
    const device = await this.prisma.kioskDevice.findFirst({
      where: { deletedAt: null, OR: [{ id }, { deviceId: id }, { serialNumber: id }] },
    });
    if (!device) throw new NotFoundException('Device not found');

    // Maintenance is a server-side state change — reuse the canonical config path
    // (terminates active sessions + pushes config to the device).
    if (SERVER_HANDLED.includes(dto.command)) {
      const enable = dto.command === 'MAINTENANCE_OFF';
      await this.devices.updateConfig(device.id, {
        isEnabled: enable,
        maintenanceMessage: enable ? undefined : (dto.payload?.message as string | undefined),
      } as any);
      const action = await this.prisma.kioskAction.create({
        data: {
          deviceId: device.id,
          adminId: actorId ?? null,
          action: dto.command,
          payload: dto.payload as Prisma.InputJsonValue | undefined,
          result: 'SUCCESS',
        },
      });
      this.realtime.emitToCms('command:result', {
        deviceId: device.id, actionId: action.id, command: dto.command,
        status: 'SUCCESS', at: new Date().toISOString(),
      });
      return { actionId: action.id, status: 'SUCCESS', delivered: true };
    }

    const action = await this.prisma.kioskAction.create({
      data: {
        deviceId: device.id,
        adminId: actorId ?? null,
        action: dto.command,
        payload: dto.payload as Prisma.InputJsonValue | undefined,
        result: 'QUEUED',
      },
    });

    const envelope = {
      actionId: action.id,
      command: dto.command,
      payload: dto.payload ?? {},
      issuedAt: new Date().toISOString(),
    };
    // The device WS registers under its fixed deviceId (== heartbeat key).
    const delivered = this.realtime.sendToDevice(device.deviceId, 'command', envelope);
    const result = delivered ? 'DELIVERED' : 'DEVICE_OFFLINE';
    await this.prisma.kioskAction.update({ where: { id: action.id }, data: { result } });

    this.realtime.emitToCms('command:issued', {
      deviceId: device.id, actionId: action.id, command: dto.command,
      result, at: action.performedAt.toISOString(),
    });

    return { actionId: action.id, status: result, delivered };
  }

  /** A device reports the outcome of a previously dispatched command. */
  async ackCommand(dto: AckCommandDto) {
    const action = await this.prisma.kioskAction.findUnique({ where: { id: dto.actionId } });
    if (!action) throw new NotFoundException('Command not found');

    const payload = {
      ...(action.payload && typeof action.payload === 'object' ? (action.payload as object) : {}),
      ...(dto.artifact ? { artifact: dto.artifact } : {}),
      ...(dto.result ? { ackResult: dto.result } : {}),
    };
    await this.prisma.kioskAction.update({
      where: { id: action.id },
      data: { result: dto.status, payload: payload as Prisma.InputJsonValue },
    });

    this.realtime.emitToCms('command:result', {
      deviceId: action.deviceId,
      actionId: action.id,
      command: action.action,
      status: dto.status,
      result: dto.result ?? null,
      artifact: dto.artifact ?? null,
      at: new Date().toISOString(),
    });
    return { ok: true };
  }

  private shape(d: any) {
    const lastBeat = d.lastHeartbeat ? new Date(d.lastHeartbeat).getTime() : 0;
    const online = lastBeat > 0 && Date.now() - lastBeat < ONLINE_WINDOW_MS;
    const latest = d.healthLogs?.[0];
    return {
      id: d.id,
      deviceId: d.deviceId,
      serialNumber: d.serialNumber,
      name: d.name,
      placement: d.placement,
      isEnabled: d.isEnabled,
      status: !d.isEnabled ? 'MAINTENANCE' : online ? 'ONLINE' : 'OFFLINE',
      online,
      maintenanceMessage: d.maintenanceMessage,
      model: d.model,
      firmwareVersion: d.firmwareVersion,
      appVersion: latest?.appVersion ?? null,
      ipAddress: d.ipAddress,
      macAddress: d.macAddress,
      lastHeartbeat: d.lastHeartbeat,
      location: d.location,
      metrics: latest
        ? {
            cpu: latest.cpuUsage,
            memory: latest.memoryUsage,
            disk: latest.diskUsage,
            temperature: latest.temperatureC,
            latency: latest.networkLatency,
            currentScreen: latest.currentScreen,
            at: latest.createdAt,
          }
        : null,
      components: (d.components ?? []).map((c: any) => ({
        type: c.type,
        name: c.name,
        status: c.status,
        lastChecked: c.lastChecked,
      })),
    };
  }
}
