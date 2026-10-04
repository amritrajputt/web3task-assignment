import type { ErrorRequestHandler } from 'express';
import { ApiResponse } from './api-response';
import { AppError } from './app-error';

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidateCodes = [
    'code' in error ? error.code : undefined,
    'cause' in error && typeof error.cause === 'object' && error.cause !== null && 'code' in error.cause
      ? error.cause.code
      : undefined,
  ];

  const candidateConstraints = [
    'constraint' in error ? error.constraint : undefined,
    'cause' in error &&
    typeof error.cause === 'object' &&
    error.cause !== null &&
    'constraint' in error.cause
      ? error.cause.constraint
      : undefined,
  ];

  return (
    candidateCodes.includes('23505') &&
    candidateConstraints.some(
      (constraint) =>
        typeof constraint === 'string' && constraint.includes('users_email_key'),
    )
  );
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res
      .status(error.statusCode)
      .json(ApiResponse.error(error.message, error.statusCode, error.details));
    return;
  }

  if (isUniqueConstraintError(error)) {
    res
      .status(409)
      .json(
        ApiResponse.error('An account with this email already exists', 409),
      );
    return;
  }

  console.error(error);
  res
    .status(500)
    .json(ApiResponse.error('Internal server error', 500));
};
