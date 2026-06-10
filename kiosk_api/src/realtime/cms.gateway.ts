import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({ namespace: '/cms', cors: { origin: true, credentials: true } })
export class CmsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly realtime: RealtimeService) {}

  handleConnection() {
    this.realtime.bindCms(this.server);
  }

  @SubscribeMessage('command')
  command(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { deviceId: string; command: string; payload?: Record<string, unknown> },
  ) {
    this.realtime.sendCommand(payload.deviceId, payload);
    socket.emit('command_sent', { ok: true });
    return { ok: true };
  }
}
