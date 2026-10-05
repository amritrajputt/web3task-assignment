import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { AppError } from '../../../common';
import { verifyToken } from '../../../common/tokens/jwt.auth.tokens';
import { roomManager, type WatchRoom } from './models/room';
import type { Participant } from './models/participant';
import { extractToken } from './utils';
import { registerRoomLifecycleHandlers } from './handlers/room.handler';
import { registerPlaybackHandlers } from './handlers/playback.handler';
import { registerQueueHandlers } from './handlers/queue.handler';
import { registerRequestHandlers } from './handlers/request.handler';
import { registerRoleHandlers } from './handlers/role.handler';
import { registerChatHandlers } from './handlers/chat.handler';

export * from './types';
export * from './utils';
export * from './models/participant';
export * from './models/playback';
export * from './models/requests';
export * from './models/room';

export function attachRoomSockets(server: HttpServer, _origin?: string): Server {
  const io = new Server(server, {
    path: '/api/socket.io',
    cors: {
      origin: (_reqOrigin, callback) => {
        callback(null, true);
      },
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    try {
      socket.data.userId = verifyToken(token).id;
      next();
    } catch {
      next(new Error('Invalid or expired access token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const requireInRoom = (): WatchRoom => {
      const roomId = socket.data.roomId as string | undefined;
      if (!roomId) {
        throw AppError.badRequest('You must join a room first');
      }
      const room = roomManager.getRoom(roomId);
      if (!room) {
        throw AppError.notFound('Room session not found');
      }
      return room;
    };

    const requireControlPermission = (room: WatchRoom): Participant => {
      const userId = socket.data.userId as string;
      const participant = room.getParticipant(userId);
      if (!participant) {
        throw AppError.forbidden('You must join the room first');
      }
      if (!participant.canControlPlayback()) {
        throw AppError.forbidden(
          'Playback controls are restricted to the host and moderators. Participants can request a video change instead.',
        );
      }
      return participant;
    };

    registerRoomLifecycleHandlers(io, socket, roomManager);
    registerPlaybackHandlers(io, socket, requireInRoom, requireControlPermission);
    registerQueueHandlers(io, socket, requireInRoom, requireControlPermission);
    registerRequestHandlers(io, socket, roomManager, requireInRoom, requireControlPermission);
    registerRoleHandlers(io, socket, requireInRoom);
    registerChatHandlers(io, socket, requireInRoom);
  });

  return io;
}
