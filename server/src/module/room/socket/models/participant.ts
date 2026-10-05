import type { Role, ParticipantJSON } from '../types';

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
