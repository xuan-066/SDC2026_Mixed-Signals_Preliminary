import { demoHeaders } from './demo';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Same-origin call to the Python API. Auth rides on Clerk's __session cookie; no tokens here. */
export async function api<T>(path: string, method: Method = 'GET', body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(import.meta.env.BASE_URL.replace(/\/$/, '') + '/v1' + path, {
      method,
      credentials: 'include',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(extraHeaders ?? {}), ...demoHeaders() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', navigator.onLine ? 'Could not reach SejukGuard. Check your connection and try again.' : 'You are offline. Changes were not sent.');
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('sejukguard-session-expired'));
    let code = 'http_' + res.status;
    let message = res.statusText || 'Request failed';
    try {
      const j = await res.json();
      if (j?.error) {
        code = j.error.code ?? code;
        message = j.error.message ?? message;
      } else if (j?.detail) {
        message = typeof j.detail === 'string' ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: { msg?: string }) => d.msg).join('; ') : JSON.stringify(j.detail);
      }
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return 'Conflict: ' + e.message;
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

