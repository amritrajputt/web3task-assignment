import { db } from '../../index';
import { AppError } from '../../common';
import { roomModerators, rooms, users } from '../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';

export type RoomRole = 'host' | 'moderator' | 'participant';

export interface RoomParticipantInfo {
  id: string;
  name: string;
  role: RoomRole;
}

export interface RoomSummary {
  id: string;
  name: string;
  hostId: string;
  hasPassword: boolean;
  createdAt: Date;
}

export class RoomService {

  static async createRoom(
    name: string,
    password: string | undefined,
    userId: string,
  ): Promise<RoomSummary> {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw AppError.notFound('User not found');
    }

    const hashedPassword = password ? await hash(password, 10) : null;

    const [room] = await db
      .insert(rooms)
      .values({
        id: randomUUID(),
        userId,
        name,
        password: hashedPassword,
      })
      .returning({
        id: rooms.id,
        name: rooms.name,
        userId: rooms.userId,
        createdAt: rooms.createdAt,
      });

    if (!room) {
      throw new Error('Room insert returned no row');
    }

    return {
      id: room.id,
      name: room.name,
      hostId: room.userId,
      hasPassword: Boolean(password),
      createdAt: room.createdAt,
    };
  }

  static async getRoom(
    roomId: string,
    userId: string,
    password?: string,
  ): Promise<{
    room: RoomSummary;
    participant: RoomParticipantInfo;
  }> {
    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (!room) {
      throw AppError.notFound('Room not found');
    }

    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw AppError.notFound('User not found');
    }

    const isHost = room.userId === userId;

    if (!isHost && room.password) {
      if (!password) {
        throw AppError.unauthorized('A valid room password is required');
      }
      const matches =
        (await compare(password, room.password)) || password === room.password;
      if (!matches) {
        throw AppError.unauthorized('Invalid room password');
      }
    }

    const [moderator] = await db
      .select({ moderatorId: roomModerators.moderatorId })
      .from(roomModerators)
      .where(
        and(
          eq(roomModerators.roomId, roomId),
          eq(roomModerators.moderatorId, userId),
        ),
      )
      .limit(1);

    const role: RoomRole = isHost
      ? 'host'
      : moderator
        ? 'moderator'
        : 'participant';

    return {
      room: {
        id: room.id,
        name: room.name,
        hostId: room.userId,
        hasPassword: Boolean(room.password),
        createdAt: room.createdAt,
      },
      participant: {
        id: user.id,
        name: user.name,
        role,
      },
    };
  }

  static async getRoomDetails(roomId: string): Promise<RoomSummary> {
    const [room] = await db
      .select({
        id: rooms.id,
        name: rooms.name,
        hostId: rooms.userId,
        password: rooms.password,
        createdAt: rooms.createdAt,
      })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (!room) {
      throw AppError.notFound('Room not found');
    }

    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      hasPassword: Boolean(room.password),
      createdAt: room.createdAt,
    };
  }

  static async getUserRooms(userId: string): Promise<RoomSummary[]> {
    const userRooms = await db
      .select({
        id: rooms.id,
        name: rooms.name,
        hostId: rooms.userId,
        createdAt: rooms.createdAt,
        hasPassword: sql<boolean>`CASE WHEN ${rooms.password} IS NOT NULL THEN true ELSE false END`,
      })
      .from(rooms)
      .where(eq(rooms.userId, userId))
      .orderBy(desc(rooms.createdAt));

    return userRooms;
  }

  static async isModerator(roomId: string, userId: string): Promise<boolean> {
    const [moderator] = await db
      .select({ moderatorId: roomModerators.moderatorId })
      .from(roomModerators)
      .where(
        and(
          eq(roomModerators.roomId, roomId),
          eq(roomModerators.moderatorId, userId),
        ),
      )
      .limit(1);

    return Boolean(moderator);
  }

  static async getRoomModerators(roomId: string): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
    }>
  > {
    const [room] = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (!room) {
      throw AppError.notFound('Room not found');
    }

    const moderators = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(roomModerators)
      .innerJoin(users, eq(users.id, roomModerators.moderatorId))
      .where(eq(roomModerators.roomId, roomId));

    return moderators;
  }

  static async setModerator(
    roomId: string,
    hostUserId: string,
    targetUserId: string,
    enabled: boolean,
  ): Promise<void> {
    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (!room) {
      throw AppError.notFound('Room not found');
    }

    if (room.userId !== hostUserId) {
      throw AppError.forbidden('Only the host can assign moderators');
    }

    if (targetUserId === hostUserId) {
      throw AppError.badRequest('The host already has full administrative controls');
    }

    const [targetUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      throw AppError.notFound('Participant user not found');
    }

    const alreadyModerator = await this.isModerator(roomId, targetUserId);

    if (enabled) {
      if (alreadyModerator) {
        return;
      }
      await db
        .insert(roomModerators)
        .values({ roomId, moderatorId: targetUserId })
        .onConflictDoNothing();
      return;
    }

    if (!enabled && alreadyModerator) {
      await db
        .delete(roomModerators)
        .where(
          and(
            eq(roomModerators.roomId, roomId),
            eq(roomModerators.moderatorId, targetUserId),
          ),
        );
    }
  }

  static async transferHost(
    roomId: string,
    currentHostId: string,
    newHostId: string,
  ): Promise<void> {
    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (!room) {
      throw AppError.notFound('Room not found');
    }

    if (room.userId !== currentHostId) {
      throw AppError.forbidden('Only the host can transfer room ownership');
    }

    if (newHostId === currentHostId) {
      throw AppError.badRequest('You are already the host of this room');
    }

    const [newHost] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, newHostId))
      .limit(1);

    if (!newHost) {
      throw AppError.notFound('New host user not found');
    }

    await db
      .update(rooms)
      .set({ userId: newHostId, updatedAt: new Date() })
      .where(eq(rooms.id, roomId));

    await db
      .delete(roomModerators)
      .where(
        and(
          eq(roomModerators.roomId, roomId),
          eq(roomModerators.moderatorId, newHostId),
        ),
      );

    await db
      .insert(roomModerators)
      .values({ roomId, moderatorId: currentHostId })
      .onConflictDoNothing();
  }

  static async deleteRoom(roomId: string, hostUserId: string): Promise<void> {
    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (!room) {
      throw AppError.notFound('Room not found');
    }

    if (room.userId !== hostUserId) {
      throw AppError.forbidden('Only the host can delete this room');
    }

    await db.delete(rooms).where(eq(rooms.id, roomId));
  }
}