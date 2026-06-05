import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { RemoteCommand } from "@smart-kiosk/shared-types";
import { RealtimeService } from "./realtime.service";
import { CommandsService } from "../commands/commands.service";

@WebSocketGateway({ namespace: "/cms", cors: { origin: true, credentials: true } })
export class CmsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly commands: CommandsService
  ) {}

  handleConnection() {
    this.realtime.bindCms(this.server);
  }

  @SubscribeMessage("command")
  async command(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    payload: {
      deviceId: string;
      command: RemoteCommand;
      payload?: Record<string, unknown>;
    }
  ) {
    const command = await this.commands.issue(payload);
    socket.emit("command_created", command);
    return { ok: true, commandId: command.id };
  }
}
