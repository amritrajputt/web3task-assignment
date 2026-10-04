export class ApiResponse<T> {
  readonly success: boolean;

  constructor(
    readonly statusCode: number,
    readonly data: T | null,
    readonly message: string,
    readonly errors?: unknown,
  ) {
    this.success = statusCode >= 200 && statusCode < 300;
  }

  static ok<T>(data: T, message = 'Success'): ApiResponse<T> {
    return new ApiResponse(200, data, message);
  }

  static created<T>(data: T, message = 'Created'): ApiResponse<T> {
    return new ApiResponse(201, data, message);
  }

  static error(
    message: string,
    statusCode = 400,
    errors?: unknown,
  ): ApiResponse<null> {
    return new ApiResponse(statusCode, null, message, errors);
  }
}
