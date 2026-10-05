import { randomUUID } from 'node:crypto';
import type { VideoRequest } from '../types';
import type { Participant } from './participant';

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
