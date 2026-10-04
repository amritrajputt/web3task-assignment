import type { ErrorRequestHandler } from 'express';
import { ApiResponse } from './api-response';
import { AppError } from './app-error';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res
      .status(error.statusCode)
      .json(ApiResponse.error(error.message, error.statusCode, error.details));
    return;
  }

  console.error(error);
  res
    .status(500)
    .json(ApiResponse.error('Internal server error', 500));
};
