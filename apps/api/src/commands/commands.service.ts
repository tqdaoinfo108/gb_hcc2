import { Injectable, NotFoundException } from "@nestjs/common";
import { CommandType, Prisma, type CommandStatus } from "@prisma/client";
import type { RemoteCommand } from "@smart-kiosk/shared-types";
import { PrismaService } from "../prisma.service";
import { AuditService } from "../audit/audit.service";
import { RealtimeService } from "../realtime/realtime.service";

const commandMap: Record<RemoteCommand, CommandType> = {
  restart_app: CommandType.RESTART_APP,
  restart_device: CommandType.RESTART_DEVICE,
  lock: CommandType.LOCK,
  unlock: CommandType.UNLOCK,
  clear_cache: CommandType.CLEAR_CACHE,
  capture_screen: CommandType.CAPTURE_SCREEN,
  push_workflow: CommandType.PUSH_WORKFLOW,
  update_config: CommandType.UPDATE_CONFIG
};

@Injectable()
export class CommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService
  ) {}

  async issue(input: {
    deviceId: string;
    command: RemoteCommand;
    payload?: Record<string, unknown>;
    userId?: string;
  }) {
    const device = await this.prisma.device.findUnique({ where: { deviceId: input.deviceId } });
    if (!device) {
      throw new NotFoundException("Device not found");
    }

    const command = await this.prisma.deviceCommand.create({
      data: {
        deviceId: device.id,
        command: commandMap[input.command],
        payload: input.payload as Prisma.InputJsonValue | undefined,
        issuedById: input.userId
      }
    });

    await this.audit.record({
      userId: input.userId,
      action: input.command,
      entityType: "device",
      entityId: device.id,
      metadata: input.payload
    });

    this.realtime.sendCommand(input.deviceId, {
      id: command.id,
      deviceId: input.deviceId,
      command: input.command,
      payload: input.payload,
      issuedAt: command.issuedAt.toISOString()
    });

    return command;
  }

  async acknowledge(commandId: string, status: Extract<CommandStatus, "ACK" | "SUCCESS" | "FAILED">, response?: Record<string, unknown>) {
    return this.prisma.deviceCommand.update({
      where: { id: commandId },
      data: {
        status,
        response: response as Prisma.InputJsonValue | undefined,
        acknowledgedAt: status === "ACK" ? new Date() : undefined,
        completedAt: status === "SUCCESS" || status === "FAILED" ? new Date() : undefined
      }
    });
  }
}
