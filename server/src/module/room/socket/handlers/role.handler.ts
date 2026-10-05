import type { Server, Socket } from 'socket.io';
import { AppError } from '../../../../common';
import { RoomService } from '../../room.service';
import type { WatchRoom } from '../models/room';
import { broadcastParticipants, reportError, roomName } from '../utils';

export function registerRoleHandlers(
  io: Server,
  socket: Socket,
  requireInRoom: () => WatchRoom,
): void {
  const handleAssignRole = async (data: {
    userId?: unknown;
    role?: unknown;
    enabled?: unknown;
  }) => {
    try {
      const room = requireInRoom();
      const callerUserId = socket.data.userId as string;
      const caller = room.getParticipant(callerUserId);

      if (!caller || !caller.isHost()) {
        throw AppError.forbidden('Only the host can assign roles');
      }

      if (typeof data?.userId !== 'string') {
        throw AppError.badRequest('Target user ID is required');
      }
      const targetUserId = data.userId;

      if (targetUserId === callerUserId) {
        throw AppError.badRequest('The host already has full administrative controls');
      }

      const target = room.getParticipant(targetUserId);
      if (!target) {
        throw AppError.notFound('Participant is not currently in this room');
      }

      const wantsModerator =
        typeof data.enabled === 'boolean'
          ? data.enabled
          : data.role === 'moderator';

      if (wantsModerator && target.role === 'moderator') {
        socket.emit('room:notice', {
          message: `${target.name} is already a moderator`,
        });
        return;
      }

      await RoomService.setModerator(
        room.id,
        callerUserId,
        targetUserId,
        wantsModerator,
      );

      target.role = wantsModerator ? 'moderator' : 'participant';

      const participantList = room.getParticipantsList();

      io.to(roomName(room.id)).emit('role_assigned', {
        userId: target.id,
        username: target.name,
        role: target.role,
        canControl: target.canControlPlayback(),
        participants: participantList,
      });
      broadcastParticipants(io, room);
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('assign_role', handleAssignRole);
  socket.on('participant:set-moderator', handleAssignRole);

  const handleRemoveParticipant = (data: { userId?: unknown }) => {
    try {
      const room = requireInRoom();
      const callerUserId = socket.data.userId as string;
      const caller = room.getParticipant(callerUserId);

      if (!caller || !caller.isHost()) {
        throw AppError.forbidden('Only the host can remove participants');
      }

      if (typeof data?.userId !== 'string') {
        throw AppError.badRequest('Target user ID is required');
      }
      const targetUserId = data.userId;

      if (targetUserId === callerUserId) {
        throw AppError.badRequest('The host cannot remove themselves');
      }

      const target = room.getParticipant(targetUserId);
      if (!target) {
        throw AppError.notFound('Participant is not in this room');
      }

      for (const sockId of target.socketIds) {
        const targetSocket = io.sockets.sockets.get(sockId);
        if (targetSocket) {
          targetSocket.emit('participant_removed', {
            userId: target.id,
            message: 'You have been removed from the room by the host',
          });
          targetSocket.emit('room:kicked', {
            roomId: room.id,
            message: 'You have been removed from the room by the host',
          });
          targetSocket.leave(roomName(room.id));
          targetSocket.data.roomId = undefined;
        }
      }

      room.removeParticipant(targetUserId);
      const remainingList = room.getParticipantsList();

      io.to(roomName(room.id)).emit('participant_removed', {
        userId: target.id,
        participants: remainingList,
      });
      broadcastParticipants(io, room);
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('remove_participant', handleRemoveParticipant);
  socket.on('participant:remove', handleRemoveParticipant);

  const handleTransferHost = async (data: {
    newHostId?: unknown;
    userId?: unknown;
  }) => {
    try {
      const room = requireInRoom();
      const callerUserId = socket.data.userId as string;
      const caller = room.getParticipant(callerUserId);

      if (!caller || !caller.isHost()) {
        throw AppError.forbidden('Only the host can transfer room ownership');
      }

      const newHostId =
        typeof data?.newHostId === 'string'
          ? data.newHostId
          : typeof data?.userId === 'string'
            ? data.userId
            : undefined;

      if (!newHostId) {
        throw AppError.badRequest('New host ID is required');
      }

      const target = room.getParticipant(newHostId);
      if (!target) {
        throw AppError.notFound('Participant is not currently in this room');
      }

      await RoomService.transferHost(room.id, callerUserId, newHostId);

      caller.role = 'moderator';
      target.role = 'host';
      room.hostId = newHostId;

      const participantList = room.getParticipantsList();

      io.to(roomName(room.id)).emit('host_transferred', {
        newHostId: target.id,
        oldHostId: caller.id,
        participants: participantList,
      });
      io.to(roomName(room.id)).emit('role_assigned', {
        userId: target.id,
        username: target.name,
        role: 'host',
        canControl: true,
        participants: participantList,
      });
      broadcastParticipants(io, room);
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('transfer_host', handleTransferHost);
  socket.on('participant:transfer-host', handleTransferHost);
}
