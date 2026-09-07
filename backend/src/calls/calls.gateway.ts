import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../auth/types/jwt-payload';

// Pure signaling relay - this gateway never sees or touches the
// actual audio stream. All it does is pass along the small JSON
// messages (SDP offers/answers, ICE candidates) two browsers need to
// exchange to negotiate a direct WebRTC connection between
// themselves. Each connected socket joins a room named after its own
// user id, so relaying "to this user" works regardless of how many
// tabs or devices they have open.
//
// Honest about what isn't configured here: only free public STUN
// servers are used on the frontend side of this (no TURN server -
// that needs a hosted relay this project has no infrastructure for),
// so on some restrictive networks the two peers may fail to find a
// direct path to each other even after signaling succeeds correctly.
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/calls' })
export class CallsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(CallsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('No token provided.');
      const payload = this.jwtService.verify<JwtPayload>(token, { secret: this.config.get<string>('JWT_SECRET', 'dev-secret-change-me') });
      client.data.userId = payload.sub;
      await client.join(`user:${payload.sub}`);
    } catch {
      this.logger.warn(`Rejected an unauthenticated call-signaling connection (${client.id}).`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    // Nothing to clean up server-side - call state itself lives in the
    // database via CallsService, not in this gateway's memory.
    void client;
  }

  @SubscribeMessage('call:signal')
  handleSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { toUserId: string; callId: string; signal: unknown },
  ) {
    this.server.to(`user:${data.toUserId}`).emit('call:signal', {
      fromUserId: client.data.userId,
      callId: data.callId,
      signal: data.signal,
    });
  }

  // Called by CallsService after a REST call to notify the invited
  // participants in real time, rather than making them poll for it.
  notifyIncomingCall(userIds: string[], call: unknown) {
    userIds.forEach((userId) => this.server.to(`user:${userId}`).emit('call:incoming', call));
  }

  notifyCallEnded(userIds: string[], callId: string) {
    userIds.forEach((userId) => this.server.to(`user:${userId}`).emit('call:ended', { callId }));
  }
}
