import type { Request, Response } from 'express';
import { ApiResponse, AppError } from '../../common';
import { AuthService, type AuthResult, type PublicUser } from './auth.service';
import {
  clearAuthCookies,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
} from './auth.cookies';

function sendAuthResponse(
  res: Response,
  result: AuthResult,
  statusCode: number,
  message: string,
): void {
  setAuthCookies(res, result);
  res.status(statusCode).json(
    statusCode === 201
      ? ApiResponse.created({ user: result.user }, message)
      : ApiResponse.ok({ user: result.user }, message),
  );
}

export class AuthController {
  static register = async (req: Request, res: Response) => {
    const result = await AuthService.register(
      req.body.name,
      req.body.email,
      req.body.password,
    );

    sendAuthResponse(res, result, 201, 'Account created');
  };

  static login = async (req: Request, res: Response) => {
    const result = await AuthService.login(req.body.email, req.body.password);
    sendAuthResponse(res, result, 200, 'Login successful');
  };

  static refresh = async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw AppError.unauthorized('Refresh token cookie required');
    }

    const result = await AuthService.refresh(refreshToken);
    sendAuthResponse(res, result, 200, 'Tokens refreshed');
  };

  static logout = async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    clearAuthCookies(res);

    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      await AuthService.logout(refreshToken);
    }

    res.status(200).json(ApiResponse.ok(null, 'Logged out'));
  };

  static me = async (_req: Request, res: Response) => {
    const user = await AuthService.getCurrentUser(res.locals.auth.id);
    res.status(200).json(ApiResponse.ok(user));
  };
}
