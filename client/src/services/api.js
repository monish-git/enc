// Thin fetch wrapper. Auth is an HTTP-only cookie set by the server (never readable from JS).
// The X-Requested-With header is the CSRF guard the server requires on every state-changing call.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export class ApiError extends Error {
  constructor(status, message, code, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(method, path, body, { quiet401 = false, signal } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      signal,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'ECN',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK ERROR - SERVER UNREACHABLE', 'NETWORK');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && !quiet401 && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, data?.error || `REQUEST FAILED (${res.status})`, data?.code, data);
  }
  return data;
}

export const api = {
  get: (p, opts) => request('GET', p, undefined, opts),
  post: (p, b = {}, opts) => request('POST', p, b, opts),
  put: (p, b = {}, opts) => request('PUT', p, b, opts),
  del: (p, opts) => request('DELETE', p, undefined, opts),
};

export const errMsg = (e) => (e?.message ? String(e.message) : 'UNKNOWN ERROR');
