import type { CookieOptions } from 'express';
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from '../../common/tokens/jwt.auth.tokens';

export const ACCESS_COOKIE_NAME = 'accessToken';
export const REFRESH_COOKIE_NAME = 'refreshToken';

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type CookieResponse = {
  cookie(name: string, value: string, options: CookieOptions): unknown;
  clearCookie(name: string, options: CookieOptions): unknown;
};

function cookieOptions(maxAge: number): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge,
  };
}

export function setAuthCookies(res: CookieResponse, tokens: AuthTokens): void {
  res.cookie(
    ACCESS_COOKIE_NAME,
    tokens.accessToken,
    cookieOptions(ACCESS_TOKEN_TTL_MS),
  );
  res.cookie(
    REFRESH_COOKIE_NAME,
    tokens.refreshToken,
    cookieOptions(REFRESH_TOKEN_TTL_MS),
  );
}

export function clearAuthCookies(res: CookieResponse): void {
  const opts = cookieOptions(0);
  delete opts.maxAge;
  res.clearCookie(ACCESS_COOKIE_NAME, opts);
  res.clearCookie(REFRESH_COOKIE_NAME, opts);
}
