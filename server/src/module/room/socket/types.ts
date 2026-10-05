import type { RoomRole } from '../room.service';

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
