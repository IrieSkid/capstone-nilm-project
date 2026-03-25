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

export function getFieldErrors<T extends string>(error: unknown) {
  if (!(error instanceof ApiError)) {
    return {} as Partial<Record<T, string>>;
  }

  const rawFieldErrors =
    typeof error.details === 'object' &&
    error.details !== null &&
    'fieldErrors' in error.details
      ? (error.details as { fieldErrors?: Record<string, unknown> }).fieldErrors
      : null;

  if (!rawFieldErrors || typeof rawFieldErrors !== 'object') {
    return {} as Partial<Record<T, string>>;
  }

  return Object.entries(rawFieldErrors).reduce<Partial<Record<T, string>>>((result, [key, value]) => {
    if (typeof value === 'string') {
      result[key as T] = value;
    }

    return result;
  }, {});
}
