import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({ namespace: '/kiosk', cors: { origin: true, credentials: true } })
export class KioskGateway {
  constructor(private readonly realtime: RealtimeService) {}

  @SubscribeMessage('remote_debug')
  remoteDebug(@MessageBody() payload: Record<string, unknown>) {
    this.realtime.emitToCms('kiosk:debug', payload);
    return { ok: true };
  }

  @SubscribeMessage('error')
  error(@MessageBody() payload: Record<string, unknown>) {
    this.realtime.emitToCms('kiosk:error', payload);
    return { ok: true };
  }
}
