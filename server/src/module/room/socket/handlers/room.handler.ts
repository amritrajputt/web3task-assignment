import type { Server, Socket } from 'socket.io';
import { AppError } from '../../../../common';
import { RoomService } from '../../room.service';
import type { RoomManager } from '../models/room';
import { broadcastParticipants, reportError, roomName } from '../utils';

export function registerRoomLifecycleHandlers(
  io: Server,
  socket: Socket,
  roomManager: RoomManager,
): void {
  const handleJoin = async (
    payload: { roomId?: unknown; password?: unknown; username?: unknown },
    callback?: (res: { ok: boolean; message?: string }) => void,
  ) => {
    try {
      const rawRoomId = payload?.roomId;
      if (typeof rawRoomId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rawRoomId)) {
        throw AppError.badRequest('Enter a valid room code / ID');
      }
      const roomId = rawRoomId;
      const password =
        typeof payload.password === 'string' ? payload.password : undefined;

      const { room: roomInfo, participant: participantInfo } =
        await RoomService.getRoom(roomId, socket.data.userId, password);

      const prevRoomId = socket.data.roomId as string | undefined;
      if (prevRoomId && prevRoomId !== roomId) {
        socket.leave(roomName(prevRoomId));
        const prevRoom = roomManager.getRoom(prevRoomId);
        if (prevRoom) {
          const { remainingSockets, participant } = prevRoom.removeSocket(
            socket.data.userId,
            socket.id,
          );
          if (remainingSockets === 0 && participant) {
            io.to(roomName(prevRoomId)).emit('user_left', {
              username: participant.name,
              userId: participant.id,
              participants: prevRoom.getParticipantsList(),
            });
            broadcastParticipants(io, prevRoom);
            roomManager.removeRoomIfEmpty(prevRoomId);
          }
        }
      }

      socket.data.roomId = roomId;
      socket.join(roomName(roomId));

      const room = roomManager.getOrCreateRoom(
        roomId,
        roomInfo.name,
        roomInfo.hostId,
      );
      const participant = room.addSocket(participantInfo, socket.id);

      const currentPlayback = room.playback.getState();
      const syncPayload = room.playback.getSyncPayload();
      const participantList = room.getParticipantsList();

      socket.emit('sync_state', syncPayload);
      socket.emit('room:state', {
        room: roomInfo,
        participant: participant.toJSON(),
        participants: participantList,
        playback: currentPlayback,
        queue: room.getQueue(),
      });

      io.to(roomName(roomId)).emit('user_joined', {
        username: participant.name,
        userId: participant.id,
        role: participant.role,
        canControl: participant.canControlPlayback(),
        participants: participantList,
      });
      broadcastParticipants(io, room);

      callback?.({ ok: true });
    } catch (error) {
      reportError(socket, error);
      callback?.({
        ok: false,
        message: error instanceof Error ? error.message : 'Unable to join room',
      });
    }
  };

  socket.on('join_room', handleJoin);
  socket.on('room:join', handleJoin);

  const handleLeave = () => {
    try {
      const roomId = socket.data.roomId as string | undefined;
      if (!roomId) return;
      const room = roomManager.getRoom(roomId);
      socket.leave(roomName(roomId));
      socket.data.roomId = undefined;

      if (room) {
        const { remainingSockets, participant } = room.removeSocket(
          socket.data.userId,
          socket.id,
        );
        if (remainingSockets === 0 && participant) {
          io.to(roomName(roomId)).emit('user_left', {
            username: participant.name,
            userId: participant.id,
            participants: room.getParticipantsList(),
          });
          broadcastParticipants(io, room);
          roomManager.removeRoomIfEmpty(roomId);
        }
      }
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('leave_room', handleLeave);
  socket.on('room:leave', handleLeave);

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId as string | undefined;
    const userId = socket.data.userId as string | undefined;
    if (!roomId || !userId) return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const { remainingSockets, participant } = room.removeSocket(
      userId,
      socket.id,
    );
    if (remainingSockets === 0 && participant) {
      io.to(roomName(roomId)).emit('user_left', {
        username: participant.name,
        userId: participant.id,
        participants: room.getParticipantsList(),
      });
      broadcastParticipants(io, room);
      roomManager.removeRoomIfEmpty(roomId);
    }
  });
}
