import { MessageBody, SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import type { RemoteDebugSnapshot } from "@smart-kiosk/shared-types";
import { socketEvents } from "@smart-kiosk/shared-types";
import { RealtimeService } from "./realtime.service";

@WebSocketGateway({ namespace: "/kiosk", cors: { origin: true, credentials: true } })
export class KioskGateway {
  constructor(private readonly realtime: RealtimeService) {}

  @SubscribeMessage("remote_debug")
  remoteDebug(@MessageBody() payload: RemoteDebugSnapshot) {
    this.realtime.emitToCms(socketEvents.remoteDebug, payload);
    return { ok: true };
  }

  @SubscribeMessage("error")
  error(@MessageBody() payload: Record<string, unknown>) {
    this.realtime.emitToCms(socketEvents.error, payload);
    return { ok: true };
  }
}
