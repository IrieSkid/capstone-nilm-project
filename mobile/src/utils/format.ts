export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, unit?: string) {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  return `${new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 2,
  }).format(value)}${unit ? ` ${unit}` : ''}`;
}

export function formatConfidence(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  return `${Math.round(value * 100)}%`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'No data yet';
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatDuration(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  if (value < 60) {
    return `${value}s`;
  }

  const totalMinutes = Math.floor(value / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (totalHours > 0) {
    return `${totalHours}h ${minutes}m`;
  }

  return `${totalMinutes}m`;
}
