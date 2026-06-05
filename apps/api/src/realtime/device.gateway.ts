import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway
} from "@nestjs/websockets";
import type { Socket } from "socket.io";
import type { CommandResultPayload, DeviceHeartbeatPayload } from "@smart-kiosk/shared-types";
import { socketEvents } from "@smart-kiosk/shared-types";
import { DevicesService } from "../devices/devices.service";
import { CommandsService } from "../commands/commands.service";
import { RealtimeService } from "./realtime.service";

@WebSocketGateway({ namespace: "/device", cors: { origin: true, credentials: true } })
export class DeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly devices: DevicesService,
    private readonly commands: CommandsService,
    private readonly realtime: RealtimeService
  ) {}

  handleConnection() {}

  async handleDisconnect(socket: Socket) {
    const deviceId = this.realtime.unregisterDevice(socket);
    if (deviceId) {
      await this.devices.markOffline(deviceId);
      this.realtime.emitToCms(socketEvents.deviceOffline, { deviceId, timestamp: new Date().toISOString() });
    }
  }

  @SubscribeMessage("heartbeat")
  async heartbeat(@ConnectedSocket() socket: Socket, @MessageBody() payload: DeviceHeartbeatPayload) {
    const result = await this.devices.recordHeartbeat(payload);
    this.realtime.registerDevice(socket, payload);
    this.realtime.emitToCms(socketEvents.heartbeat, {
      device: result.device,
      status: result.status
    });
    this.realtime.emitToCms(socketEvents.deviceOnline, {
      deviceId: payload.deviceId,
      timestamp: new Date().toISOString()
    });
    return { ok: true };
  }

  @SubscribeMessage("command_result")
  async commandResult(@MessageBody() payload: CommandResultPayload) {
    await this.commands.acknowledge(payload.commandId, payload.status, payload.response);
    this.realtime.emitToCms(socketEvents.commandResult, payload);
    return { ok: true };
  }
}
