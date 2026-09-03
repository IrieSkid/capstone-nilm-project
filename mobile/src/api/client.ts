export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const FALLBACK_API_BASE_URL = 'http://localhost:4000/api/v1';
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

export function getApiBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_BASE_URL || FALLBACK_API_BASE_URL).replace(/\/$/, '');
}

export async function apiRequest<T>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    token?: string | null;
    body?: unknown;
    timeoutMs?: number;
  },
) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const rawText = await response.text();
    const payload = rawText ? JSON.parse(rawText) : null;

    if (!response.ok) {
      throw new ApiError(response.status, payload?.message || 'Request failed.', payload?.details);
    }

    return (payload?.data ?? null) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, `The server did not respond within ${Math.round(timeoutMs / 1000)} seconds.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
