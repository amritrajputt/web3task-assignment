import {
  createHash,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { AppError } from '../../common';
import {
  generateAccessToken,
  generateRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  verifyRefreshToken,
} from '../../common/tokens/jwt.auth.tokens';
import { db } from '../../index';
import { users, type User } from '../../db/schema';

const BCRYPT_ROUNDS = 12;

export type PublicUser = Pick<
  User,
  'id' | 'name' | 'email'  | 'createdAt' | 'updatedAt'
>;

export type AuthResult = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

const publicUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function matchesHash(actual: string, expected: string): boolean {
  if (
    Buffer.byteLength(actual) !== Buffer.byteLength(expected)
  ) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function issueTokens(userId: string): Pick<AuthResult, 'accessToken' | 'refreshToken'> {
  return {
    accessToken: generateAccessToken(userId),
    refreshToken: generateRefreshToken(userId),
  };
}

export class AuthService {
  static async register(
    name: string,
    email: string,
    password: string,
  ): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    const userId = randomUUID();
    const tokens = issueTokens(userId);

    const [user] = await db
      .insert(users)
      .values({
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        password: passwordHash,
        refreshToken: hashRefreshToken(tokens.refreshToken),
        refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      })
      .returning(publicUserColumns);

    if (!user) {
      throw new Error('User insert returned no row');
    }

    return { user, ...tokens };
  }

  static async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await db
      .select({
        ...publicUserColumns,
        password: users.password,
      })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    const passwordMatches = user
      ? await compare(password, user.password)
      : false;

    if (!user || !passwordMatches) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const tokens = issueTokens(user.id);
    const refreshTokenHash = hashRefreshToken(tokens.refreshToken);
    const [updatedUser] = await db
      .update(users)
      .set({
        refreshToken: refreshTokenHash,
        refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning(publicUserColumns);

    if (!updatedUser) {
      throw new Error('User disappeared while completing login');
    }

    return { user: updatedUser, ...tokens };
  }

  static async refresh(refreshToken: string): Promise<AuthResult> {
    const { id } = verifyRefreshToken(refreshToken);
    const [user] = await db
      .select({
        ...publicUserColumns,
        refreshToken: users.refreshToken,
        refreshTokenExpiresAt: users.refreshTokenExpiresAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    const currentHash = hashRefreshToken(refreshToken);

    if (
      !user ||
      !user.refreshToken ||
      !user.refreshTokenExpiresAt ||
      user.refreshTokenExpiresAt <= new Date() ||
      !matchesHash(currentHash, user.refreshToken)
    ) {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    const tokens = issueTokens(user.id);
    const nextHash = hashRefreshToken(tokens.refreshToken);
    const [updatedUser] = await db
      .update(users)
      .set({
        refreshToken: nextHash,
        refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        updatedAt: new Date(),
      })
      .where(
        and(eq(users.id, user.id), eq(users.refreshToken, user.refreshToken)),
      )
      .returning(publicUserColumns);

    if (!updatedUser) {
      throw AppError.unauthorized('Refresh token has already been used');
    }

    return { user: updatedUser, ...tokens };
  }

  static async logout(refreshToken: string): Promise<void> {
    const { id } = verifyRefreshToken(refreshToken);
    const tokenHash = hashRefreshToken(refreshToken);
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);

    if (!user?.refreshToken || !matchesHash(tokenHash, user.refreshToken)) {
      throw AppError.unauthorized('Invalid refresh token');
    }

    const [revokedUser] = await db
      .update(users)
      .set({
        refreshToken: null,
        refreshTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, id), eq(users.refreshToken, user.refreshToken)))
      .returning({ id: users.id });

    if (!revokedUser) {
      throw AppError.unauthorized('Refresh token has already been used');
    }
  }

  static async getCurrentUser(userId: string): Promise<PublicUser> {
    const [user] = await db
      .select(publicUserColumns)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      throw AppError.notFound('User not found');
    }
    return user;
  }
}
