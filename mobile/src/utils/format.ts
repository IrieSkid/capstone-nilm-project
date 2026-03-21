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
