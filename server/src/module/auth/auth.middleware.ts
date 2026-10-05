import type { RequestHandler } from 'express';
import { AppError } from '../../common';
import { verifyToken } from '../../common/tokens/jwt.auth.tokens';
import { ACCESS_COOKIE_NAME } from './auth.cookies';

export const authenticate: RequestHandler = (req, res, next) => {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (
    typeof req.cookies?.[ACCESS_COOKIE_NAME] === 'string' &&
    req.cookies[ACCESS_COOKIE_NAME].length > 0
  ) {
    token = req.cookies[ACCESS_COOKIE_NAME];
  }

  if (!token) {
    next(AppError.unauthorized('Access token required'));
    return;
  }

  try {
    res.locals.auth = verifyToken(token);
    next();
  } catch (error) {
    next(error);
  }
};
