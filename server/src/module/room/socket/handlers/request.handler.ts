import type { Server, Socket } from 'socket.io';
import { AppError } from '../../../../common';
import type { WatchRoom, RoomManager } from '../models/room';
import type { Participant } from '../models/participant';
import { broadcastSync, parseYoutubeVideoId, reportError, roomName } from '../utils';

export function registerRequestHandlers(
  io: Server,
  socket: Socket,
  roomManager: RoomManager,
  requireInRoom: () => WatchRoom,
  requireControlPermission: (room: WatchRoom) => Participant,
): void {
  const handleVideoRequest = (data: { url?: unknown; videoId?: unknown }) => {
    try {
      const room = requireInRoom();
      const userId = socket.data.userId as string;
      const participant = room.getParticipant(userId);
      if (!participant) throw AppError.forbidden('Join the room first');

      const videoId = parseYoutubeVideoId(data?.videoId) ?? parseYoutubeVideoId(data?.url);
      if (!videoId) {
        throw AppError.badRequest('Enter a valid YouTube video URL or ID');
      }

      if (participant.canControlPlayback()) {
        room.playback.setVideo(videoId);
        broadcastSync(io, room, 'video');
        io.to(roomName(room.id)).emit('change_video', { videoId });
        return;
      }

      const request = roomManager.videoRequests.create(room.id, videoId, participant);

      socket.emit('video_request_created', { id: request.id });
      socket.emit('video:request-created', { id: request.id });

      const modSockets = room.getModeratorSockets();
      for (const sockId of modSockets) {
        io.to(sockId).emit('video_approval_needed', request);
        io.to(sockId).emit('video:approval-needed', request);
      }
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('video:request', handleVideoRequest);
  socket.on('request_video', handleVideoRequest);

  const handleVideoApprove = (data: { requestId?: unknown; approved?: unknown }) => {
    try {
      const room = requireInRoom();
      requireControlPermission(room);

      if (typeof data?.requestId !== 'string' || typeof data?.approved !== 'boolean') {
        throw AppError.badRequest('Invalid approval payload');
      }

      const request = roomManager.videoRequests.resolve(data.requestId);
      if (!request || request.roomId !== room.id) {
        throw AppError.notFound('Video request no longer exists');
      }

      if (data.approved) {
        if (!room.playback.videoId) {
          room.playback.setVideo(request.videoId);
          room.playback.play(0);
          broadcastSync(io, room, 'video');
          io.to(roomName(room.id)).emit('change_video', { videoId: request.videoId });
          io.to(roomName(room.id)).emit('play', { currentTime: 0 });
        } else {
          room.addToQueue(request.videoId, request.requester);
          io.to(roomName(room.id)).emit('queue:update', room.getQueue());
          io.to(roomName(room.id)).emit('queue_update', room.getQueue());
        }
      }

      const requester = room.getParticipant(request.requester.id);
      if (requester) {
        for (const sId of requester.socketIds) {
          io.to(sId).emit('video_request_result', {
            id: request.id,
            approved: data.approved,
          });
          io.to(sId).emit('video:request-result', {
            id: request.id,
            approved: data.approved,
          });
        }
      }
    } catch (error) {
      reportError(socket, error);
    }
  };

  socket.on('video:approve', handleVideoApprove);
  socket.on('approve_video', handleVideoApprove);
}
