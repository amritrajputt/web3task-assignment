import { randomUUID } from 'node:crypto';
import type { Role, ParticipantJSON, QueueItem, ChatMessage } from '../types';
import { Participant } from './participant';
import { PlaybackManager } from './playback';
import { VideoRequestManager } from './requests';

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
