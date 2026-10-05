import type { Server, Socket } from 'socket.io';
import { AppError } from '../../../../common';
import type { WatchRoom } from '../models/room';
import { reportError, roomName } from '../utils';

export function registerChatHandlers(
  io: Server,
  socket: Socket,
  requireInRoom: () => WatchRoom,
): void {
  const handleChatMessage = (data: { message?: unknown }) => {
    try {
      const room = requireInRoom();
      const userId = socket.data.userId as string;
      const participant = room.getParticipant(userId);
      if (!participant) throw AppError.forbidden('Join the room first');

      if (
        typeof data?.message !== 'string' ||
        data.message.trim().length === 0 ||
        data.message.length > 500
      ) {
        throw AppError.badRequest('Message must be between 1 and 500 characters');
      }

      const chatMsg = room.addMessage(participant, data.message.trim());
      io.to(roomName(room.id)).emit('chat_message', chatMsg);
      io.to(roomName(room.id)).emit('chat:message', chatMsg);
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('chat_message', handleChatMessage);
  socket.on('chat:send', handleChatMessage);

  const handleReaction = (data: { emoji?: unknown }) => {
    try {
      const room = requireInRoom();
      const userId = socket.data.userId as string;
      const participant = room.getParticipant(userId);
      if (!participant) throw AppError.forbidden('Join the room first');

      if (typeof data?.emoji !== 'string' || data.emoji.trim().length === 0) {
        return;
      }

      const payload = {
        userId: participant.id,
        username: participant.name,
        emoji: data.emoji.trim(),
        timestamp: Date.now(),
      };

      io.to(roomName(room.id)).emit('reaction_received', payload);
      io.to(roomName(room.id)).emit('reaction:received', payload);
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('send_reaction', handleReaction);
  socket.on('reaction:send', handleReaction);
}
