import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(128),
});

export const registerSchema = z.object({
  name: z.string().trim().min(3).max(255),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(128),
});
