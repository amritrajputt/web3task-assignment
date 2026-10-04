import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { z } from 'zod';
import { ApiResponse, AppError } from '../../common';
import { AuthService, type PublicUser } from './auth.service';
import { loginSchema, registerSchema } from './auth.dto';
import {
  clearAuthCookies,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
} from './auth.cookies';

export class AuthController {
  static register: RequestHandler<
    ParamsDictionary,
    ApiResponse<{ user: PublicUser }>,
    z.infer<typeof registerSchema>
  > = async (req, res) => {
    const result = await AuthService.register(
      req.body.name,
      req.body.email,
      req.body.password,
    );
    setAuthCookies(res, result);
    res
      .status(201)
      .json(ApiResponse.created({ user: result.user }, 'Account created'));
  };

  static login: RequestHandler<
    ParamsDictionary,
    ApiResponse<{ user: PublicUser }>,
    z.infer<typeof loginSchema>
  > = async (req, res) => {
    const result = await AuthService.login(req.body.email, req.body.password);
    setAuthCookies(res, result);
    res
      .status(200)
      .json(ApiResponse.ok({ user: result.user }, 'Login successful'));
  };

  static refresh: RequestHandler<
    ParamsDictionary,
    ApiResponse<{ user: PublicUser }>
  > = async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw AppError.unauthorized('Refresh token cookie required');
    }

    const result = await AuthService.refresh(refreshToken);
    setAuthCookies(res, result);
    res
      .status(200)
      .json(ApiResponse.ok({ user: result.user }, 'Tokens refreshed'));
  };

  static logout: RequestHandler<
    ParamsDictionary,
    ApiResponse<null>
  > = async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    clearAuthCookies(res);

    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      await AuthService.logout(refreshToken);
    }

    res.status(200).json(ApiResponse.ok(null, 'Logged out'));
  };

  static me: RequestHandler<
    ParamsDictionary,
    ApiResponse<PublicUser>
  > = async (_req, res) => {
    const user = await AuthService.getCurrentUser(res.locals.auth.id);
    res.status(200).json(ApiResponse.ok(user));
  };
}
