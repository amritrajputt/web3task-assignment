import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import { AppError } from '../../common';
import { verifyToken } from '../../common/tokens/jwt.auth.tokens';
import { RoomService, type RoomRole } from './room.service';

export type Role = RoomRole;

export interface ParticipantJSON {
  id: string;
  name: string;
  role: Role;
  canControl: boolean;
}

export interface PlaybackStateJSON {
  videoId: string | null;
  playing: boolean;
  currentTime: number;
  updatedAt: number;
}

export interface SyncStatePayload {
  playState: 'playing' | 'paused';
  currentTime: number;
  videoId: string | null;
}

export interface VideoRequest {
  id: string;
  roomId: string;
  videoId: string;
  requester: ParticipantJSON;
  createdAt: number;
}

export interface QueueItem {
  id: string;
  videoId: string;
  title?: string;
  addedBy: ParticipantJSON;
  addedAt: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  sender: ParticipantJSON;
  message: string;
  timestamp: number;
}

function roomName(roomId: string): string {
  return `room:${roomId}`;
}

export function parseYoutubeVideoId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;

  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    let videoId: string | null = null;
    if (url.hostname === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (
      url.hostname === 'youtube.com' ||
      url.hostname.endsWith('.youtube.com') ||
      url.hostname === 'www.youtube-nocookie.com'
    ) {
      videoId =
        url.searchParams.get('v') ??
        url.pathname.match(/^\/(?:embed|shorts|v)\/([^/?]+)/)?.[1] ??
        null;
    }

    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  const item = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!item) return null;

  try {
    return decodeURIComponent(item.slice(name.length + 1));
  } catch {
    return null;
  }
}

function extractToken(socket: Socket): string | null {
  const cookieHeader = socket.handshake.headers.cookie;
  const fromCookie = readCookie(cookieHeader, 'accessToken');
  if (fromCookie) return fromCookie;

  const authHeader = socket.handshake.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const handshakeAuth = socket.handshake.auth?.token;
  if (typeof handshakeAuth === 'string' && handshakeAuth.length > 0) {
    return handshakeAuth;
  }

  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }

  return null;
}

export class Participant {
  public id: string;
  public name: string;
  public role: Role;
  public socketIds: Set<string>;

  constructor(id: string, name: string, role: Role, initialSocketId?: string) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.socketIds = new Set(initialSocketId ? [initialSocketId] : []);
  }

  isHost(): boolean {
    return this.role === 'host';
  }

  isModerator(): boolean {
    return this.role === 'host' || this.role === 'moderator';
  }

  canControlPlayback(): boolean {
    return this.isModerator();
  }

  toJSON(): ParticipantJSON {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      canControl: this.canControlPlayback(),
    };
  }
}

export class PlaybackManager {
  public videoId: string | null = null;
  public playing: boolean = false;
  public currentTime: number = 0;
  public updatedAt: number = Date.now();

  getState(): PlaybackStateJSON {
    let current = this.currentTime;
    if (this.playing) {
      current += (Date.now() - this.updatedAt) / 1000;
    }
    return {
      videoId: this.videoId,
      playing: this.playing,
      currentTime: current,
      updatedAt: this.updatedAt,
    };
  }

  getSyncPayload(): SyncStatePayload {
    const state = this.getState();
    return {
      playState: state.playing ? 'playing' : 'paused',
      currentTime: state.currentTime,
      videoId: state.videoId,
    };
  }

  play(time?: number): PlaybackStateJSON {
    if (typeof time === 'number' && Number.isFinite(time) && time >= 0) {
      this.currentTime = time;
    } else if (this.playing) {
      this.currentTime += (Date.now() - this.updatedAt) / 1000;
    }
    this.playing = true;
    this.updatedAt = Date.now();
    return this.getState();
  }

  pause(time?: number): PlaybackStateJSON {
    if (typeof time === 'number' && Number.isFinite(time) && time >= 0) {
      this.currentTime = time;
    } else if (this.playing) {
      this.currentTime += (Date.now() - this.updatedAt) / 1000;
    }
    this.playing = false;
    this.updatedAt = Date.now();
    return this.getState();
  }

  seek(time: number): PlaybackStateJSON {
    this.currentTime = Math.max(0, time);
    this.updatedAt = Date.now();
    return this.getState();
  }

  setVideo(videoId: string): PlaybackStateJSON {
    this.videoId = videoId;
    this.currentTime = 0;
    this.playing = false;
    this.updatedAt = Date.now();
    return this.getState();
  }
}

export class VideoRequestManager {
  private requests = new Map<string, VideoRequest>();

  create(roomId: string, videoId: string, requester: Participant): VideoRequest {
    const request: VideoRequest = {
      id: randomUUID(),
      roomId,
      videoId,
      requester: requester.toJSON(),
      createdAt: Date.now(),
    };
    this.requests.set(request.id, request);
    return request;
  }

  get(id: string): VideoRequest | undefined {
    return this.requests.get(id);
  }

  resolve(id: string): VideoRequest | undefined {
    const req = this.requests.get(id);
    if (req) {
      this.requests.delete(id);
    }
    return req;
  }

  clearForRoom(roomId: string): void {
    for (const [id, req] of this.requests) {
      if (req.roomId === roomId) {
        this.requests.delete(id);
      }
    }
  }
}

export class WatchRoom {
  public id: string;
  public name: string;
  public hostId: string;
  public participants = new Map<string, Participant>();
  public playback = new PlaybackManager();
  public messages: ChatMessage[] = [];
  public queue: QueueItem[] = [];

  constructor(id: string, name: string, hostId: string) {
    this.id = id;
    this.name = name;
    this.hostId = hostId;
  }

  addToQueue(videoId: string, addedBy: Participant | ParticipantJSON, title?: string): QueueItem {
    const participantJson = 'toJSON' in addedBy && typeof addedBy.toJSON === 'function'
      ? addedBy.toJSON()
      : (addedBy as ParticipantJSON);

    const item: QueueItem = {
      id: randomUUID(),
      videoId,
      title: title || `YouTube Video (${videoId})`,
      addedBy: participantJson,
      addedAt: Date.now(),
    };
    this.queue.push(item);
    return item;
  }

  removeFromQueue(itemId: string): QueueItem | undefined {
    const idx = this.queue.findIndex((q) => q.id === itemId);
    if (idx !== -1) {
      const [removed] = this.queue.splice(idx, 1);
      return removed;
    }
    return undefined;
  }

  playNextFromQueue(): QueueItem | null {
    if (this.queue.length === 0) return null;
    const nextItem = this.queue.shift()!;
    this.playback.setVideo(nextItem.videoId);
    this.playback.play(0);
    return nextItem;
  }

  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  addSocket(
    user: { id: string; name: string; role: Role },
    socketId: string,
  ): Participant {
    let participant = this.participants.get(user.id);
    if (!participant) {
      participant = new Participant(user.id, user.name, user.role, socketId);
      this.participants.set(user.id, participant);
    } else {
      participant.socketIds.add(socketId);
      participant.name = user.name;
      if (participant.role !== 'host') {
        participant.role = user.role;
      }
    }
    return participant;
  }

  removeSocket(
    userId: string,
    socketId: string,
  ): { remainingSockets: number; participant?: Participant } {
    const participant = this.participants.get(userId);
    if (!participant) {
      return { remainingSockets: 0 };
    }
    participant.socketIds.delete(socketId);
    if (participant.socketIds.size === 0) {
      this.participants.delete(userId);
      return { remainingSockets: 0, participant };
    }
    return { remainingSockets: participant.socketIds.size, participant };
  }

  removeParticipant(userId: string): Participant | undefined {
    const participant = this.participants.get(userId);
    if (participant) {
      this.participants.delete(userId);
    }
    return participant;
  }

  getParticipant(userId: string): Participant | undefined {
    return this.participants.get(userId);
  }

  getParticipantsList(): ParticipantJSON[] {
    return Array.from(this.participants.values()).map((p) => p.toJSON());
  }

  getModeratorSockets(): string[] {
    const socketIds: string[] = [];
    for (const p of this.participants.values()) {
      if (p.isModerator()) {
        socketIds.push(...p.socketIds);
      }
    }
    return socketIds;
  }

  addMessage(sender: Participant, message: string): ChatMessage {
    const msg: ChatMessage = {
      id: randomUUID(),
      roomId: this.id,
      sender: sender.toJSON(),
      message,
      timestamp: Date.now(),
    };
    this.messages.push(msg);
    if (this.messages.length > 100) {
      this.messages.shift();
    }
    return msg;
  }
}

export class RoomManager {
  private rooms = new Map<string, WatchRoom>();
  public videoRequests = new VideoRequestManager();

  getRoom(roomId: string): WatchRoom | undefined {
    return this.rooms.get(roomId);
  }

  getOrCreateRoom(roomId: string, name: string, hostId: string): WatchRoom {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new WatchRoom(roomId, name, hostId);
      this.rooms.set(roomId, room);
    }
    return room;
  }

  removeRoomIfEmpty(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (room && room.participants.size === 0) {
      this.videoRequests.clearForRoom(roomId);
      this.rooms.delete(roomId);
      return true;
    }
    return false;
  }
}

export const roomManager = new RoomManager();

function reportError(socket: Socket, error: unknown): void {
  const message =
    error instanceof AppError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Unable to complete room action';

  socket.emit('error', { message });
  socket.emit('room:error', { message });
}

function broadcastSync(io: Server, room: WatchRoom, action: string): void {
  const syncPayload = room.playback.getSyncPayload();
  const playbackState = room.playback.getState();
  const rName = roomName(room.id);

  io.to(rName).emit('sync_state', syncPayload);
  io.to(rName).emit('playback:sync', { ...playbackState, action });
}

function broadcastParticipants(io: Server, room: WatchRoom): void {
  const list = room.getParticipantsList();
  const rName = roomName(room.id);
  io.to(rName).emit('room:participants', list);
}

export function attachRoomSockets(server: HttpServer, origin: string): Server {
  const io = new Server(server, {
    path: '/api/socket.io',
    cors: {
      origin: (reqOrigin, callback) => {
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

  io.on('connection', (socket) => {
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

    socket.on('play', (data?: { currentTime?: unknown }) => {
      try {
        const room = requireInRoom();
        requireControlPermission(room);
        const time =
          typeof data?.currentTime === 'number' ? data.currentTime : undefined;
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
        const time =
          typeof data?.currentTime === 'number' ? data.currentTime : undefined;
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
        if (
          typeof data?.time !== 'number' ||
          !Number.isFinite(data.time) ||
          data.time < 0
        ) {
          throw AppError.badRequest('Invalid seek timestamp');
        }
        room.playback.seek(data.time);
        broadcastSync(io, room, 'seek');
        io.to(roomName(room.id)).emit('seek', { time: data.time });
      } catch (error) {
        reportError(socket, error);
      }
    });

    socket.on(
      'playback:control',
      (data: { action?: unknown; currentTime?: unknown }) => {
        try {
          const room = requireInRoom();
          requireControlPermission(room);
          const action = String(data?.action);
          const time =
            typeof data?.currentTime === 'number' ? data.currentTime : 0;

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
      },
    );

    socket.on(
      'change_video',
      (data: { videoId?: unknown; url?: unknown }) => {
        try {
          const room = requireInRoom();
          requireControlPermission(room);

          const videoId =
            parseYoutubeVideoId(data?.videoId) ?? parseYoutubeVideoId(data?.url);
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
      },
    );

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

        const videoId =
          parseYoutubeVideoId(data?.videoId) ?? parseYoutubeVideoId(data?.url);
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

    const handleVideoRequest = (data: { url?: unknown; videoId?: unknown }) => {
      try {
        const room = requireInRoom();
        const userId = socket.data.userId as string;
        const participant = room.getParticipant(userId);
        if (!participant) throw AppError.forbidden('Join the room first');

        const videoId =
          parseYoutubeVideoId(data?.videoId) ?? parseYoutubeVideoId(data?.url);
        if (!videoId) {
          throw AppError.badRequest('Enter a valid YouTube video URL or ID');
        }

        if (participant.canControlPlayback()) {
          room.playback.setVideo(videoId);
          broadcastSync(io, room, 'video');
          io.to(roomName(room.id)).emit('change_video', { videoId });
          return;
        }

        const request = roomManager.videoRequests.create(
          room.id,
          videoId,
          participant,
        );

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

    const handleVideoApprove = (data: {
      requestId?: unknown;
      approved?: unknown;
    }) => {
      try {
        const room = requireInRoom();
        requireControlPermission(room);

        if (
          typeof data?.requestId !== 'string' ||
          typeof data?.approved !== 'boolean'
        ) {
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
            io.to(roomName(room.id)).emit('change_video', {
              videoId: request.videoId,
            });
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
  });

  return io;
}
