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

function cookieOptions(path: string, maxAge: number): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path,
    maxAge,
  };
}

export function setAuthCookies(res: CookieResponse, tokens: AuthTokens): void {
  res.cookie(
    ACCESS_COOKIE_NAME,
    tokens.accessToken,
    cookieOptions('/api', ACCESS_TOKEN_TTL_MS),
  );
  res.cookie(
    REFRESH_COOKIE_NAME,
    tokens.refreshToken,
    cookieOptions('/api/auth', REFRESH_TOKEN_TTL_MS),
  );
}

export function clearAuthCookies(res: CookieResponse): void {
  const accessOptions = cookieOptions('/api', 0);
  const refreshOptions = cookieOptions('/api/auth', 0);
  delete accessOptions.maxAge;
  delete refreshOptions.maxAge;
  res.clearCookie(ACCESS_COOKIE_NAME, accessOptions);
  res.clearCookie(REFRESH_COOKIE_NAME, refreshOptions);
}
