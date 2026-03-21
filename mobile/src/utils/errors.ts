import { ApiError } from '../api/client';

export function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}
