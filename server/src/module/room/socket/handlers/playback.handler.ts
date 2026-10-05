import type { Server, Socket } from 'socket.io';
import { AppError } from '../../../../common';
import type { WatchRoom } from '../models/room';
import type { Participant } from '../models/participant';
import { broadcastSync, parseYoutubeVideoId, reportError, roomName } from '../utils';

export function registerPlaybackHandlers(
  io: Server,
  socket: Socket,
  requireInRoom: () => WatchRoom,
  requireControlPermission: (room: WatchRoom) => Participant,
): void {
  socket.on('play', (data?: { currentTime?: unknown }) => {
    try {
      const room = requireInRoom();
      requireControlPermission(room);
      const time = typeof data?.currentTime === 'number' ? data.currentTime : undefined;
      room.playback.play(time);
      broadcastSync(io, room, 'play');
      io.to(roomName(room.id)).emit('play', { currentTime: room.playback.currentTime });
    } catch (error) {
      reportError(socket, error);
    }
  });

  socket.on('pause', (data?: { currentTime?: unknown }) => {
    try {
      const room = requireInRoom();
      requireControlPermission(room);
      const time = typeof data?.currentTime === 'number' ? data.currentTime : undefined;
      room.playback.pause(time);
      broadcastSync(io, room, 'pause');
      io.to(roomName(room.id)).emit('pause', { currentTime: room.playback.currentTime });
    } catch (error) {
      reportError(socket, error);
    }
  });

  socket.on('seek', (data: { time?: unknown }) => {
    try {
      const room = requireInRoom();
      requireControlPermission(room);
      if (typeof data?.time !== 'number' || !Number.isFinite(data.time) || data.time < 0) {
        throw AppError.badRequest('Invalid seek timestamp');
      }
      room.playback.seek(data.time);
      broadcastSync(io, room, 'seek');
      io.to(roomName(room.id)).emit('seek', { time: data.time });
    } catch (error) {
      reportError(socket, error);
    }
  });

  socket.on('playback:control', (data: { action?: unknown; currentTime?: unknown }) => {
    try {
      const room = requireInRoom();
      requireControlPermission(room);
      const action = String(data?.action);
      const time = typeof data?.currentTime === 'number' ? data.currentTime : 0;

      if (action === 'play') {
        room.playback.play(time);
      } else if (action === 'pause') {
        room.playback.pause(time);
      } else if (action === 'seek') {
        room.playback.seek(time);
      } else {
        throw AppError.badRequest('Unknown playback action');
      }

      broadcastSync(io, room, action);
      if (action === 'play') io.to(roomName(room.id)).emit('play', { currentTime: time });
      if (action === 'pause') io.to(roomName(room.id)).emit('pause', { currentTime: time });
      if (action === 'seek') io.to(roomName(room.id)).emit('seek', { time });
    } catch (error) {
      reportError(socket, error);
    }
  });

  socket.on('change_video', (data: { videoId?: unknown; url?: unknown }) => {
    try {
      const room = requireInRoom();
      requireControlPermission(room);

      const videoId = parseYoutubeVideoId(data?.videoId) ?? parseYoutubeVideoId(data?.url);
      if (!videoId) {
        throw AppError.badRequest('Enter a valid YouTube video ID or URL');
      }

      room.playback.setVideo(videoId);
      room.playback.play(0);
      broadcastSync(io, room, 'video');
      io.to(roomName(room.id)).emit('change_video', { videoId });
      io.to(roomName(room.id)).emit('play', { currentTime: 0 });
    } catch (error) {
      reportError(socket, error);
    }
  });
}
