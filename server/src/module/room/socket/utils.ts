import type { Socket, Server } from 'socket.io';
import { AppError } from '../../../common';
import type { WatchRoom } from './models/room';

export function roomName(roomId: string): string {
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

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
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

export function extractToken(socket: Socket): string | null {
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

export function reportError(socket: Socket, error: unknown): void {
  const message =
    error instanceof AppError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Unable to complete room action';

  socket.emit('error', { message });
  socket.emit('room:error', { message });
}

export function broadcastSync(io: Server, room: WatchRoom, action: string): void {
  const syncPayload = room.playback.getSyncPayload();
  const playbackState = room.playback.getState();
  const rName = roomName(room.id);

  io.to(rName).emit('sync_state', syncPayload);
  io.to(rName).emit('playback:sync', { ...playbackState, action });
}

export function broadcastParticipants(io: Server, room: WatchRoom): void {
  const list = room.getParticipantsList();
  const rName = roomName(room.id);
  io.to(rName).emit('room:participants', list);
}
