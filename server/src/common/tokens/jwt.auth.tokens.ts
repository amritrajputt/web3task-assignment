import jwt, { type JwtPayload } from 'jsonwebtoken';
import { AppError } from '../app-error';

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TokenPayload {
  id: string;
}

function getSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const secret = process.env[name];
  if (!secret || secret.length < 32) {
    throw new Error(`${name} must be set to a value at least 32 characters long`);
  }
  return secret;
}

export function assertTokenSecrets(): void {
  const accessSecret = getSecret('JWT_SECRET');
  const refreshSecret = getSecret('JWT_REFRESH_SECRET');
  if (accessSecret === refreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
}

function createToken(
  userId: string,
  secret: string,
  expiresIn: '15m' | '7d',
): string {
  return jwt.sign(
    { tokenType: expiresIn === '15m' ? 'access' : 'refresh' },
    secret,
    { subject: userId, expiresIn },
  );
}

function verifyTokenType(
  token: string,
  secret: string,
  expectedType: 'access' | 'refresh',
): TokenPayload {
  try {
    const payload = jwt.verify(token, secret);
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      (payload as JwtPayload & { tokenType?: string }).tokenType !== expectedType
    ) {
      throw AppError.unauthorized('Invalid token');
    }

    return { id: payload.sub };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw AppError.unauthorized('Invalid or expired token');
    }
    throw error;
  }
}

export function generateAccessToken(userId: string): string {
  return createToken(userId, getSecret('JWT_SECRET'), '15m');
}

export function generateRefreshToken(userId: string): string {
  return createToken(userId, getSecret('JWT_REFRESH_SECRET'), '7d');
}

export function verifyToken(token: string): TokenPayload {
  return verifyTokenType(token, getSecret('JWT_SECRET'), 'access');
}

export function verifyRefreshToken(token: string): TokenPayload {
  return verifyTokenType(token, getSecret('JWT_REFRESH_SECRET'), 'refresh');
}
