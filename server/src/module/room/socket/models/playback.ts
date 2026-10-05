import type { PlaybackStateJSON, SyncStatePayload } from '../types';

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
