import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({ namespace: '/device', cors: { origin: true, credentials: true } })
export class DeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly realtime: RealtimeService) {}

  handleConnection() {}

  handleDisconnect(socket: Socket) {
    const deviceId = this.realtime.unregisterDevice(socket);
    if (deviceId) {
      this.realtime.emitToCms('device:offline', { deviceId, timestamp: new Date().toISOString() });
    }
  }

  @SubscribeMessage('heartbeat')
  heartbeat(@ConnectedSocket() socket: Socket, @MessageBody() payload: { deviceId: string }) {
    this.realtime.registerDevice(socket, payload.deviceId);
    this.realtime.emitToCms('device:online', { deviceId: payload.deviceId, timestamp: new Date().toISOString() });
    return { ok: true, deviceId: payload.deviceId };
  }

  /** A kiosk screen subscribes to live updates (frames/progress) for a job. */
  @SubscribeMessage('subscribe_job')
  subscribeJob(@ConnectedSocket() socket: Socket, @MessageBody() payload: { jobId: string }) {
    this.realtime.subscribeJob(socket, payload?.jobId);
    return { ok: true, jobId: payload?.jobId };
  }

  @SubscribeMessage('unsubscribe_job')
  unsubscribeJob(@ConnectedSocket() socket: Socket, @MessageBody() payload: { jobId: string }) {
    this.realtime.unsubscribeJob(socket, payload?.jobId);
    return { ok: true };
  }
}
