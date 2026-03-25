import { AppError } from './app-error';

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

export function formatDateToMySqlDateTime(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-')
    + ` ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`;
}

export function toMySqlDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'Invalid timestamp.');
  }

  return formatDateToMySqlDateTime(date);
}

export function parseStoredDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function getDurationSecondsSince(value: string | null | undefined, now = new Date()) {
  const parsedDate = parseStoredDateTime(value);

  if (!parsedDate) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - parsedDate.getTime()) / 1000));
}
