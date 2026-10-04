export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;
  readonly isOperational = true;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details?: unknown): AppError {
    return new AppError(message, 400, details);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(message, 401);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(message, 403);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(message, 404);
  }

  static conflict(message = 'Conflict', details?: unknown): AppError {
    return new AppError(message, 409, details);
  }

  static unprocessableEntity(
    message = 'Unprocessable entity',
    details?: unknown,
  ): AppError {
    return new AppError(message, 422, details);
  }
}
