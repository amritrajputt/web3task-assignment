import jwt from "jsonwebtoken";
import type { User } from "../../db/schema.ts";
import { randomBytes, createHmac } from "node:crypto";
import { db } from "../../index.ts";
import { users } from "../../db/schema.js";
import { eq } from "drizzle-orm";

const jwtSecret = process.env.JWT_SECRET as string;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET as string;

export interface TokenPayload {
    id: string;
    iat?: number;
    exp?: number;
}

export function generateAccessToken(user: User): string {
    return jwt.sign({ id: user.id }, jwtSecret, { expiresIn: '15m' });
}
export function generateRefreshToken(user: User): string {
    return jwt.sign({ id: user.id }, jwtRefreshSecret, { expiresIn: '7d' });
}
export function verifyToken(token: string) {
    return jwt.verify(token, jwtSecret) as TokenPayload;
}
export function verifyRefreshToken(token: string) {
    return jwt.verify(token, jwtRefreshSecret) as TokenPayload;
}
