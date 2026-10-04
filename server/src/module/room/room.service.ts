import { db } from '../../index';
import { rooms } from '../../db/schema';
import { randomUUID } from 'node:crypto';

export class RoomService {
  static async createRoom(name: string, password: string, userId: string) {
    const [room] = await db
      .insert(rooms)
      .values({
        id: randomUUID(),
        userId,
        name,
        password,
      })
      .returning();

    if (!room) {
      throw new Error('Room insert returned no row');
    }

    return room;
  }
}