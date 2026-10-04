import type { RequestHandler } from 'express';
import { AppError } from '../../common';
import { verifyToken } from '../../common/tokens/jwt.auth.tokens';
import { ACCESS_COOKIE_NAME } from './auth.cookies';

export const authenticate: RequestHandler = (req, res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE_NAME];

  if (typeof token !== 'string' || token.length === 0) {
    next(AppError.unauthorized('Access token cookie required'));
    return;
  }

  try {
    res.locals.auth = verifyToken(token);
    next();
  } catch (error) {
    next(error);
  }
};
