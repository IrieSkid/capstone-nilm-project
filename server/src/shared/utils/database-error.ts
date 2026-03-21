import { AppError } from './app-error';

export function handleDatabaseError(error: unknown, duplicateMessage: string): never {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_DUP_ENTRY'
  ) {
    throw new AppError(409, duplicateMessage);
  }

  throw error;
}
