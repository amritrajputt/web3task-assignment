import type { Server, Socket } from 'socket.io';
import { AppError } from '../../../../common';
import type { WatchRoom } from '../models/room';
import type { Participant } from '../models/participant';
import { broadcastSync, parseYoutubeVideoId, reportError, roomName } from '../utils';

export function registerQueueHandlers(
  io: Server,
  socket: Socket,
  requireInRoom: () => WatchRoom,
  requireControlPermission: (room: WatchRoom) => Participant,
): void {
  const handleAddToQueue = (data: {
    videoId?: unknown;
    url?: unknown;
    title?: unknown;
    playNow?: unknown;
  }) => {
    try {
      const room = requireInRoom();
      const userId = socket.data.userId as string;
      const participant = room.getParticipant(userId);
      if (!participant) throw AppError.forbidden('Join the room first');

      const videoId = parseYoutubeVideoId(data?.videoId) ?? parseYoutubeVideoId(data?.url);
      if (!videoId) {
        throw AppError.badRequest('Enter a valid YouTube video ID or URL');
      }

      const title = typeof data?.title === 'string' ? data.title.trim() : undefined;
      const playNow = Boolean(data?.playNow);

      if ((!room.playback.videoId || playNow) && participant.canControlPlayback()) {
        room.playback.setVideo(videoId);
        room.playback.play(0);
        broadcastSync(io, room, 'video');
        io.to(roomName(room.id)).emit('change_video', { videoId });
        io.to(roomName(room.id)).emit('play', { currentTime: 0 });
        return;
      }

      room.addToQueue(videoId, participant, title);
      io.to(roomName(room.id)).emit('queue:update', room.getQueue());
      io.to(roomName(room.id)).emit('queue_update', room.getQueue());
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('queue:add', handleAddToQueue);
  socket.on('add_to_queue', handleAddToQueue);

  const handleNextSong = () => {
    try {
      const room = requireInRoom();
      requireControlPermission(room);

      const next = room.playNextFromQueue();
      if (next) {
        broadcastSync(io, room, 'video');
        io.to(roomName(room.id)).emit('change_video', { videoId: next.videoId });
        io.to(roomName(room.id)).emit('play', { currentTime: 0 });
        io.to(roomName(room.id)).emit('queue:update', room.getQueue());
        io.to(roomName(room.id)).emit('queue_update', room.getQueue());
      }
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('queue:next', handleNextSong);
  socket.on('skip_song', handleNextSong);

  const handleRemoveFromQueue = (data: { itemId?: unknown }) => {
    try {
      const room = requireInRoom();
      const userId = socket.data.userId as string;
      const participant = room.getParticipant(userId);
      if (!participant) throw AppError.forbidden('Join the room first');

      if (typeof data?.itemId !== 'string') {
        throw AppError.badRequest('Queue item ID is required');
      }

      const existing = room.queue.find((q) => q.id === data.itemId);
      if (!existing) {
        throw AppError.notFound('Queue item not found');
      }

      if (!participant.canControlPlayback() && existing.addedBy.id !== userId) {
        throw AppError.forbidden('Cannot remove this song from queue');
      }

      room.removeFromQueue(data.itemId);
      io.to(roomName(room.id)).emit('queue:update', room.getQueue());
      io.to(roomName(room.id)).emit('queue_update', room.getQueue());
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('queue:remove', handleRemoveFromQueue);
  socket.on('remove_from_queue', handleRemoveFromQueue);
}
