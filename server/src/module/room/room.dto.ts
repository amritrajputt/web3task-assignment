import { z } from 'zod';

export const createRoomSchema = z.object({
  name: z.string().trim().min(3).max(255),
  password: z.string().trim().min(3).max(255).optional(),
});

export const setModeratorSchema = z.object({
  enabled: z.boolean(),
});

export const assignRoleSchema = z.object({
  role: z.enum(['moderator', 'participant']),
});

export const transferHostSchema = z.object({
  newHostId: z.string().uuid(),
});

export const joinRoomSchema = z.object({
  password: z.string().trim().min(1).max(255).optional(),
});

