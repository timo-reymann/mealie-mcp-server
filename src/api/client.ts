import { config } from '../config.js';

export class MealieApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Mealie API error ${status}: ${body}`);
    this.name = 'MealieApiError';
  }
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export function formatParams(
  params: Record<string, string | number | boolean | string[] | undefined | null>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) {
        result[key] = value.join(',');
      }
    } else {
      result[key] = String(value);
    }
  }
  return result;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${config.baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new MealieApiError(
      res.status,
      await res.text().catch(() => ''),
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = params ? `${path}?${new URLSearchParams(params).toString()}` : path;
  return request<T>(url);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, {
    method: 'DELETE',
  });
}
