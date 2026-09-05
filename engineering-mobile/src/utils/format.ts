export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(
  value: number | null | undefined,
  unit?: string,
  maximumFractionDigits = 2,
) {
  if (value === null || value === undefined) return 'N/A';
  const formatted = new Intl.NumberFormat('en-PH', { maximumFractionDigits }).format(value);
  return `${formatted}${unit ? ` ${unit}` : ''}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'No data yet';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function formatHours(value: number | null | undefined) {
  if (value === null || value === undefined) return 'N/A';
  if (value < 24) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} d`;
}

export function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
