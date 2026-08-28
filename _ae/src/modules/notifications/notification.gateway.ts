import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

/**
 * Realtime notification gateway.
 *
 * Handshake auth: io('/', { auth: { token: '<accessToken>' } }).
 * Every client joins `user:{id}` and, when scoped to a school, `school:{id}`.
 * Feature code pushes via emitToUser / emitToSchool.
 */
@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:8080')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  },
})
export class NotificationGateway implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwt: JwtService) {}

  /** Reject unauthenticated / revoked-less handshakes up front. */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = client.handshake.auth?.token ?? this.tokenFromHeader(client);
      const payload = await this.jwt.verifyAsync(token);
      client.data.user = payload;
      client.join(`user:${payload.sub}`);
      if (payload.school_id) client.join(`school:${payload.school_id}`);
      this.logger.debug(`socket ${client.id} connected (user ${payload.sub})`);
    } catch {
      this.logger.warn(`socket ${client.id} rejected: invalid or missing token`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.logger.debug(`socket ${client.id} disconnected`);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToSchool(schoolId: string, event: string, payload: unknown): void {
    this.server?.to(`school:${schoolId}`).emit(event, payload);
  }

  /** Push a persisted notification to its owner, with a school-wide fanout. */
  emitNotification(notification: {
    id: string;
    userId: string | null;
    title: string;
    body: string;
    channel: string;
    schoolId?: string | null;
  }): void {
    const payload = {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      channel: notification.channel,
      at: new Date().toISOString(),
    };
    if (notification.userId) this.emitToUser(notification.userId, 'notification', payload);
    if (notification.schoolId) this.emitToSchool(notification.schoolId, 'notification', payload);
  }

  onModuleDestroy(): void {
    this.server?.close();
  }

  private tokenFromHeader(client: Socket): string | undefined {
    const header = client.handshake.headers?.authorization ?? '';
    const [type, token] = header.split(' ');
    return type === 'Bearer' && token ? token : undefined;
  }
}
