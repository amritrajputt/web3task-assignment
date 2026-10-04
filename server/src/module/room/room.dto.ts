import { z } from 'zod';

export const createRoomSchema = z.object({
    name: z.string().trim().min(3).max(255),
    password: z.string().trim().min(3).max(255)
})
