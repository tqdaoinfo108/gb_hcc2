import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';

@WebSocketGateway({ namespace: '/queue', cors: { origin: true, credentials: true } })
export class QueueGateway {
  @WebSocketServer()
  server!: Server;

  /** Broadcast an event to every client subscribed to the /queue namespace */
  broadcast(event: string, payload: unknown): void {
    this.server?.emit(event, payload);
  }
}
