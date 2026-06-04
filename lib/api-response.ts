export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export function createErrorResponse(statusCode: number, message: string): ApiResponse<null> {
  return {
    error: message,
  };
}

export function createSuccessResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    data,
    message,
  };
}
