'use client';

/**
 * Tiny fetch helper for AlphaFlow API routes. Injects the bearer token from
 * localStorage and returns the parsed `data` payload. Throws on non-2xx.
 *
 * All API routes respond with `{ data, degraded? }`.
 */

export interface ApiEnvelope<T> {
  data: T;
  degraded?: boolean;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function parse<T>(res: Response): Promise<ApiEnvelope<T>> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error || body?.message || '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  const json = (await res.json()) as Partial<ApiEnvelope<T>>;
  return { data: (json.data as T), degraded: json.degraded };
}

export async function apiGet<T>(path: string): Promise<ApiEnvelope<T>> {
  const res = await fetch(path, { headers: authHeaders(), cache: 'no-store' });
  return parse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiEnvelope<T>> {
  const res = await fetch(path, {
    method: 'POST',
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse<T>(res);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<ApiEnvelope<T>> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse<T>(res);
}
